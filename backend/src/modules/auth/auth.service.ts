import { prisma } from "../../config/database";
import {
  getDefaultPermissionCodes,
  normalizePermissionCode,
} from "../../config/default.permission";
import { BcryptUtils } from "../../utils/bcrypt";
import { JwtUtils, AuthPartyType } from "../../utils/jwt";
import crypto from "node:crypto";

// --------------------------------------------------
// Configuration
// --------------------------------------------------

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

// All fields needed to rebuild staff access-token claims.
const STAFF_AUTH_INCLUDE = {
  managedDepartment: { select: { id: true } },
  managedDivision: { select: { id: true } },
  managedSection: { select: { id: true } },
  section: { select: { id: true } },
  staffPermissions: {
    select: {
      permission: { select: { code: true } },
    },
  },
} as const;

// --------------------------------------------------
// Refresh-token helpers
// --------------------------------------------------

// Refresh tokens are random opaque secrets.
// Store only their hashes in the database.
const generateRefreshTokenValue = (): string =>
  crypto.randomBytes(64).toString("base64url");

const hashToken = (raw: string): string =>
  crypto.createHash("sha256").update(raw).digest("hex");

const createRefreshToken = async (
  userId: string,
  userType: AuthPartyType,
  now: Date,
) => {
  const refreshToken = generateRefreshTokenValue();

  await prisma.refreshToken.create({
    data: {
      userId,
      userType,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
    },
  });

  return refreshToken;
};

// Revoke one token. Safe to call without a token.
export const revokeRefreshToken = async (
  rawRefreshToken?: string,
): Promise<void> => {
  if (!rawRefreshToken) return;

  await prisma.refreshToken.updateMany({
    where: {
      tokenHash: hashToken(rawRefreshToken),
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
};

// Revoke all active refresh tokens for one user and party type.
// This logs the user out of all sessions tracked by this table.
export const revokeAllRefreshTokens = async (
  userId: string,
  userType: AuthPartyType,
): Promise<void> => {
  await prisma.refreshToken.updateMany({
    where: {
      userId,
      userType,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
};

// --------------------------------------------------
// Shared access-token builder
// --------------------------------------------------

export const buildAccessToken = (
  user: any,
  partyType: AuthPartyType,
): string => {
  const isStaff = partyType === "STAFF";

  let managerType: "DEPARTMENT" | "DIVISION" | "SECTION" | null = null;

  if (isStaff) {
    if (user.managedDepartment) {
      managerType = "DEPARTMENT";
    } else if (user.managedDivision) {
      managerType = "DIVISION";
    } else if (user.managedSection) {
      managerType = "SECTION";
    }
  }

  let staffRole: string | null = null;

  if (isStaff) {
    if (user.isSAdmin || user.role === "SYSTEM_ADMIN") {
      staffRole = "SYSTEM_ADMIN";
    } else if (user.isDirector || user.role === "DIRECTOR") {
      staffRole = "DIRECTOR";
    } else if (user.isManager) {
      staffRole = "MANAGER";
    } else if (user.isPSsupport || user.role === "PS_SUPPORT") {
      staffRole = "PS_SUPPORT";
    }
  }

  const defaultCodes = isStaff
    ? getDefaultPermissionCodes(
        staffRole || undefined,
        managerType || undefined,
      )
    : [];

  const customCodes = isStaff
    ? user.staffPermissions.map((sp: any) =>
        normalizePermissionCode(sp.permission.code),
      )
    : [];

  const permissionCodes = Array.from(
    new Set(
      [...defaultCodes, ...customCodes].map((code) =>
        normalizePermissionCode(code),
      ),
    ),
  );

  return JwtUtils.generateAccessToken({
    userId: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName || null,
    partyType,

    isSAdmin: isStaff
      ? user.isSAdmin || user.role === "SYSTEM_ADMIN"
      : false,

    isManager: isStaff
      ? user.isManager || Boolean(managerType)
      : false,

    isDirector: isStaff
      ? user.isDirector || user.role === "DIRECTOR"
      : false,

    managerType: isStaff ? managerType : null,

    isPSsupport: isStaff
      ? user.isPSsupport || user.role === "PS_SUPPORT"
      : false,

    departmentId: isStaff
      ? user.managedDepartment?.id || null
      : null,

    divisionId: isStaff
      ? user.managedDivision?.id || null
      : null,

    sectionId: isStaff
      ? user.section?.id || null
      : null,

    permissions: permissionCodes,
  });
};

// --------------------------------------------------
// Login
// --------------------------------------------------

export const Login = async (
  email: string,
  passwordPlain: string,
) => {
  const now = new Date();

  let user: any = null;
  let partyType: AuthPartyType = "STAFF";

  const staffUser = await prisma.staff.findUnique({
    where: { email },
    include: STAFF_AUTH_INCLUDE,
  });

  if (staffUser) {
    user = staffUser;
    partyType = "STAFF";
  } else {
    const customerUser = await prisma.customer.findUnique({
      where: { email },
    });

    if (customerUser) {
      user = customerUser;
      partyType = "CUSTOMER";
    }
  }

  // Use the same generic error for unknown email and wrong password.
  if (!user) {
    throw new Error("Invalid email or password");
  }

  if (user.lockedUntil && now < new Date(user.lockedUntil)) {
    const minutesLeft = Math.ceil(
      (new Date(user.lockedUntil).getTime() - now.getTime()) / 60000,
    );

    throw new Error(
      `Account is temporarily locked. Please try again in ${minutesLeft} minutes.`,
    );
  }

  if (user.status === "DEACTIVATED") {
    throw new Error(
      "Authentication blocked. This account has been deactivated.",
    );
  }

  if (partyType === "CUSTOMER") {
    const organization = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { isActive: true },
    });

    if (!organization || !organization.isActive) {
      throw new Error(
        "Authentication blocked. This organization is inactive.",
      );
    }
  }

  if (user.status !== "ACTIVE") {
    throw new Error(
      "Authentication blocked. Your account is not active.",
    );
  }

  const isPasswordValid = await BcryptUtils.compare(
    passwordPlain,
    user.passwordHash,
  );

  if (!isPasswordValid) {
    const updatedCount = user.failedLoginCount + 1;

    const lockoutTime =
      updatedCount >= MAX_FAILED_LOGIN_ATTEMPTS
        ? new Date(now.getTime() + LOCKOUT_DURATION_MS)
        : null;

    const updateData = {
      failedLoginCount: updatedCount,
      lockedUntil: lockoutTime,
    };

    if (partyType === "STAFF") {
      await prisma.staff.update({
        where: { id: user.id },
        data: updateData,
      });
    } else {
      await prisma.customer.update({
        where: { id: user.id },
        data: updateData,
      });
    }

    if (updatedCount >= MAX_FAILED_LOGIN_ATTEMPTS) {
      throw new Error(
        "Account has been temporarily locked due to 5 failed login attempts.",
      );
    }

    throw new Error("Invalid email or password");
  }

  // Clear previous failed attempts after successful authentication.
  if (user.failedLoginCount > 0 || user.lockedUntil) {
    const clearLockData = {
      failedLoginCount: 0,
      lockedUntil: null,
    };

    if (partyType === "STAFF") {
      await prisma.staff.update({
        where: { id: user.id },
        data: clearLockData,
      });
    } else {
      await prisma.customer.update({
        where: { id: user.id },
        data: clearLockData,
      });
    }
  }

  const accessToken = buildAccessToken(user, partyType);

  const refreshToken = await createRefreshToken(
    user.id,
    partyType,
    now,
  );

  return {
    accessToken,
    refreshToken,
    partyType,
  };
};

// --------------------------------------------------
// Refresh session / rotate refresh token
// --------------------------------------------------

export const RefreshSession = async (
  rawRefreshToken?: string,
) => {
  if (!rawRefreshToken) {
    throw new Error("Missing refresh token.");
  }

  const tokenHash = hashToken(rawRefreshToken);

  const record = await prisma.refreshToken.findFirst({
    where: { tokenHash },
  });

  if (!record) {
    throw new Error("Invalid refresh token.");
  }

  const userType = record.userType as AuthPartyType;

  // A revoked token should never be accepted again.
  // Reuse may indicate that a token was stolen.
  if (record.revokedAt) {
    await revokeAllRefreshTokens(record.userId, userType);

    throw new Error(
      "Refresh token reuse detected. Please sign in again.",
    );
  }

  const now = new Date();

  if (record.expiresAt <= now) {
    throw new Error("Refresh token expired. Please sign in again.");
  }

  // Reload current account data rather than trusting old access claims.
  const user =
    userType === "STAFF"
      ? await prisma.staff.findUnique({
          where: { id: record.userId },
          include: STAFF_AUTH_INCLUDE,
        })
      : await prisma.customer.findUnique({
          where: { id: record.userId },
        });

  if (!user || user.status !== "ACTIVE") {
    await revokeAllRefreshTokens(record.userId, userType);

    throw new Error(
      "Account is not active. Please sign in again.",
    );
  }

  // Recheck organization status for customer accounts.
  if (userType === "CUSTOMER") {
    const organization = await prisma.organization.findUnique({
      where: { id: (user as { organizationId: string }).organizationId },
      select: { isActive: true },
    });

    if (!organization || !organization.isActive) {
      await revokeAllRefreshTokens(record.userId, userType);

      throw new Error(
        "Organization is inactive. Please sign in again.",
      );
    }
  }

  // Do not refresh a currently locked account.
  if (user.lockedUntil && now < new Date(user.lockedUntil)) {
    throw new Error(
      "Account is temporarily locked. Please try again later.",
    );
  }

  // Prepare the replacement secret before the transaction.
  const newRawRefreshToken = generateRefreshTokenValue();
  const newTokenHash = hashToken(newRawRefreshToken);

  // Atomically claim the old token and insert the replacement.
  // Only one concurrent request can claim the old token.
  const rotated = await prisma.$transaction(async (tx) => {
    const claimed = await tx.refreshToken.updateMany({
      where: {
        id: record.id,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        revokedAt: now,
      },
    });

    if (claimed.count !== 1) {
      return false;
    }

    await tx.refreshToken.create({
      data: {
        userId: record.userId,
        userType: record.userType,
        tokenHash: newTokenHash,
        expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
      },
    });

    return true;
  });

  if (!rotated) {
    // Another request may have used this token first.
    // Revoke active sessions as a conservative reuse response.
    await revokeAllRefreshTokens(record.userId, userType);

    throw new Error(
      "Refresh token reuse detected. Please sign in again.",
    );
  }

  // Use the latest permissions and account details.
  const accessToken = buildAccessToken(user, userType);

  return {
    accessToken,
    refreshToken: newRawRefreshToken,
    partyType: userType,
  };
};












// import { prisma } from "../../config/database";
// import { getDefaultPermissionCodes, normalizePermissionCode } from "../../config/default.permission";
// import { BcryptUtils } from "../../utils/bcrypt";
// import { JwtUtils, AuthPartyType } from "../../utils/jwt";
// import crypto from "crypto";

// export const Login = async (email: string, passwordPlain: string) => {
//   const now = new Date();

//   let user: any = null;
//   let partyType: AuthPartyType = "STAFF";
//   let calculatedManagerType: "DEPARTMENT" | "DIVISION" | "SECTION" | null =
//     null;

//   const staffUser = await prisma.staff.findUnique({
//     where: { email },
//     include: {
//       managedDepartment: { select: { id: true } },
//       managedDivision: { select: { id: true } },
//       managedSection: { select: { id: true } },
//       section: { select: { id: true } },
//        staffPermissions: { select: { permission: { select: { code: true } } } },
//     },
//   });

//   if (staffUser) {
//     user = staffUser;
//     partyType = "STAFF";

//     if (staffUser.managedDepartment) {
//       calculatedManagerType = "DEPARTMENT";
//     } else if (staffUser.managedDivision) {
//       calculatedManagerType = "DIVISION";
//     } else if (staffUser.managedSection) {
//       calculatedManagerType = "SECTION";
//     }
//   } else {
//     const customerUser = await prisma.customer.findUnique({ where: { email } });
//     if (customerUser) {
//       user = customerUser;
//       partyType = "CUSTOMER";
//     }
//   }
// let staffRole: string | null = null;
// if (staffUser) {
//   if (staffUser.isSAdmin) {
//     staffRole = "SYSTEM_ADMIN";
//   } else if (staffUser.isDirector) {
//     staffRole = "DIRECTOR";
//   } else if (staffUser.isManager) {
//     staffRole = "MANAGER";
//   } else if (staffUser.isPSsupport) {
//     staffRole = "PS_SUPPORT";
//   }
// }

// const defaultPermissionCodes = staffUser
//   ? getDefaultPermissionCodes(staffRole || undefined, calculatedManagerType || undefined)
//   : [];
// const permissionCodes = staffUser
//   ? Array.from(new Set([
//       ...defaultPermissionCodes,
//       ...staffUser.staffPermissions.map((sp) => normalizePermissionCode(sp.permission.code)),
//     ])).map((code) => normalizePermissionCode(code))
//   : [];

// if (!user) {
//   throw new Error("Invalid email or password");
// }

//   if (user.lockedUntil && now < new Date(user.lockedUntil)) {
//     const minutesLeft = Math.ceil(
//       (new Date(user.lockedUntil).getTime() - now.getTime()) / 60000,
//     );
//     throw new Error(
//       `Account is temporarily locked. Please try again in ${minutesLeft} minutes.`,
//     );
//   }

//   if (user.status === "DEACTIVATED") {
//     throw new Error("Authentication blocked. This account has been deactivated.");
//   }

//   if (partyType === "CUSTOMER") {
//     const organization = await prisma.organization.findUnique({
//       where: { id: user.organizationId },
//       select: { isActive: true },
//     });

//     if (!organization || !organization.isActive) {
//       throw new Error("Authentication blocked. This organization is inactive.");
//     }
//   }

//   if (user.status !== "ACTIVE") {
//     throw new Error("Authentication blocked. Your account is not active.");
//   }

//   const isPasswordValid = await BcryptUtils.compare(
//     passwordPlain,
//     user.passwordHash,
//   );

//   if (!isPasswordValid) {
//     const updatedCount = user.failedLoginCount + 1;
//     let lockoutTime: Date | null = null;

//     if (updatedCount >= 5) {
//       lockoutTime = new Date(now.getTime() + 15 * 60000);
//     }

//     const updateData = {
//       failedLoginCount: updatedCount,
//       lockedUntil: lockoutTime,
//     };
//     if (partyType === "STAFF") {
//       await prisma.staff.update({ where: { id: user.id }, data: updateData });
//     } else {
//       await prisma.customer.update({
//         where: { id: user.id },
//         data: updateData,
//       });
//     }

//     if (updatedCount >= 5) {
//       throw new Error(
//         "Account has been temporarily locked due to 5 failed login attempts.",
//       );
//     }

//     throw new Error("Invalid email or password");
//   }

//   if (user.failedLoginCount > 0 || user.lockedUntil) {
//     const clearLockData = { failedLoginCount: 0, lockedUntil: null };
//     if (partyType === "STAFF") {
//       await prisma.staff.update({
//         where: { id: user.id },
//         data: clearLockData,
//       });
//     } else {
//       await prisma.customer.update({
//         where: { id: user.id },
//         data: clearLockData,
//       });
//     }
//   }

//   const isStaff = partyType === "STAFF";

//   const accessToken = JwtUtils.generateAccessToken({
//   userId: user.id,
//   email: user.email,
//   firstName: user.firstName,
//   lastName: user.lastName || null,
//   partyType,
//   isSAdmin: isStaff ? (user.isSAdmin || user.role === "SYSTEM_ADMIN") : false,
//   isManager: isStaff ? (user.isManager || Boolean(calculatedManagerType)) : false,
//   isDirector: isStaff ? (user.isDirector || user.role === "DIRECTOR") : false,
//   managerType: isStaff ? calculatedManagerType : null,
//   isPSsupport: isStaff ? (user.isPSsupport || user.role === "PS_SUPPORT") : false,
//   departmentId: isStaff ? user.managedDepartment?.id || null : null,
//   divisionId: isStaff ? user.managedDivision?.id || null : null,
//   sectionId: isStaff ? user.section?.id || null : null,
//   permissions: permissionCodes,
// });

//   const refreshToken = JwtUtils.generateRefreshToken(user.id, partyType);
//   const refreshTokenHash = crypto
//     .createHash("sha256")
//     .update(refreshToken)
//     .digest("hex");

//   await prisma.refreshToken.create({
//     data: {
//       userId: user.id,
//       userType: partyType,
//       tokenHash: refreshTokenHash,
//       expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
//     },
//   });

//   return { accessToken, refreshToken, partyType };
// };
