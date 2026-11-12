import {
    FaHome,
    FaClipboardList,
    FaComments,
    FaChartBar,
    FaUserCircle,
    FaBuilding,
    FaUsers,
    FaTicketAlt,
    FaSitemap,
    FaBoxes,
    FaPlusCircle,
    FaBell,
    FaLock,
    FaClock,
    FaCheckSquare,
    FaShieldAlt,
} from "react-icons/fa";

import { useAuth } from "../../context/useAuth";
import SidebarShell from "./SidebarShell";

/* =========================================================
   HELPERS
========================================================= */

/** Normalize a permission code for comparison. */
const norm = (code) => String(code || "").trim().toUpperCase();

/** Returns true if the user has at least one of the given permission codes. */
function hasAny(user, ...codes) {
    if (!user) return false;
    if (user.isSAdmin) return true;
    const perms = Array.isArray(user.permissions)
        ? user.permissions.map(norm)
        : [];
    return codes.some((c) => perms.includes(norm(c)));
}

/* =========================================================
   ADMIN
========================================================= */

const ADMIN_ITEMS = [
    { to: "/dashboard",                    icon: FaHome,         label: "Dashboard" },
    { to: "/admin/cases",                  icon: FaTicketAlt,    label: "Case Tracking" },
    { to: "/admin/approval",               icon: FaUserCircle,   label: "User Management" },
    { to: "/admin/department-management",  icon: FaSitemap,      label: "Department Management" },
    { to: "/admin/product-service",        icon: FaBoxes,        label: "Product & Service" },
    { to: "/organizations",                icon: FaBuilding,     label: "Organizations" },
    { to: "/feedback",                     icon: FaComments,     label: "Feedback" },
    { to: "/reports",                      icon: FaChartBar,     label: "Reports & Analytics" },
    { to: "/admin/time-report",            icon: FaClock,        label: "Time Report" },
    { to: "/admin/time-approvals",         icon: FaCheckSquare,  label: "Time Approvals" },
    { to: "/profile",                      icon: FaUserCircle,   label: "Profile" },
];

/* =========================================================
   MANAGER
========================================================= */

function getManagerOrganizationLabel(user) {
    if (user?.managerType === "DEPARTMENT") return "My Departments";
    if (user?.managerType === "DIVISION")   return "My Division";
    if (user?.managerType === "SECTION")    return "My Section";
    return "Organization";
}

const MANAGER_ITEMS = (user) => [
    { to: "/manager/dashboard",    icon: FaHome,        label: "Dashboard" },
    { to: "/manager/organization", icon: FaBuilding,    label: getManagerOrganizationLabel(user) },
    { to: "/manager/staff",        icon: FaUserCircle,  label: "Staff" },
    { to: "/manager/cases",        icon: FaTicketAlt,   label: "Cases" },
    { to: "/manager/assign-case",  icon: FaPlusCircle,  label: "Assign Case" },
    { to: "/manager/time-report",  icon: FaClock,       label: "Time Report" },
    { to: "/manager/time-approvals", icon: FaCheckSquare, label: "Time Approvals" },
    { to: "/manager/reports",      icon: FaChartBar,    label: "Reports" },
    { to: "/manager/profile",      icon: FaUserCircle,  label: "Profile" },
];

/* =========================================================
   DIRECTOR
========================================================= */

const DIRECTOR_ITEMS = [
    { to: "/director/dashboard",             icon: FaHome,       label: "Dashboard" },
    { to: "/director/users",                 icon: FaUsers,      label: "Users" },
    { to: "/director/department-management", icon: FaSitemap,    label: "Department Management" },
    { to: "/director/case-analytics",        icon: FaChartBar,   label: "Case Analytics" },
    { to: "/director/organization-summary",  icon: FaBuilding,   label: "Organization Summary" },
    { to: "/director/profile",               icon: FaUserCircle, label: "Profile" },
];

/* =========================================================
   PS SUPPORT (base)
========================================================= */

const PS_SUPPORT_BASE = [
    { to: "/support",          icon: FaHome,          label: "Dashboard" },
    { to: "/support/cases",    icon: FaClipboardList, label: "My Assigned Cases" },
    { to: "/support/my-day",   icon: FaClock,         label: "My Day" },
    { to: "/support/history",  icon: FaTicketAlt,     label: "Case History" },
    { to: "/support/feedback", icon: FaComments,      label: "Feedback Analytics" },
    { to: "/support/profile",  icon: FaUserCircle,    label: "Profile" },
];

/**
 * Build extra sidebar items for a PS_SUPPORT (or any non-admin) user based on
 * the additional permissions that an Admin has explicitly granted to them.
 *
 * Rules:
 *  - Only add an item if the user does NOT already see that page via their
 *    base role nav (avoid duplicates).
 *  - Group the extras under a visual separator so it's clear they're elevated.
 */
function getExtraItemsForUser(user) {
    const extras = [];

    // CASE_READ_ALL → can view all cases (admin case tracking)
    if (hasAny(user, "CASE_READ_ALL")) {
        extras.push({ to: "/admin/cases", icon: FaTicketAlt, label: "All Cases", extra: true });
    }

    // ORGANIZATION_MANAGE → organizations page
    if (hasAny(user, "ORGANIZATION_MANAGE")) {
        extras.push({ to: "/organizations", icon: FaBuilding, label: "Organizations", extra: true });
    }

    // STRUCTURE_MANAGE or STRUCTURE_READ_ALL → department management
    if (hasAny(user, "STRUCTURE_MANAGE", "STRUCTURE_READ_ALL")) {
        extras.push({ to: "/admin/department-management", icon: FaSitemap, label: "Departments", extra: true });
    }

    // SERVICE_MANAGE → product & service management
    if (hasAny(user, "SERVICE_MANAGE")) {
        extras.push({ to: "/admin/product-service", icon: FaBoxes, label: "Product & Service", extra: true });
    }

    // PERMISSION_DELEGATE → user management / approval page
    if (hasAny(user, "PERMISSION_DELEGATE")) {
        extras.push({ to: "/admin/approval", icon: FaShieldAlt, label: "User Management", extra: true });
    }

    // CASE_READ_ANALYTICS or VIEW_ALL_CASES_METRICS → reports & analytics
    if (hasAny(user, "CASE_READ_ANALYTICS", "VIEW_ALL_CASES_METRICS", "VIEW_ALL_CASES_DETAIL")) {
        extras.push({ to: "/reports", icon: FaChartBar, label: "Reports & Analytics", extra: true });
    }

    // TIME_READ_TEAM → time report & approvals (use manager URLs)
    if (hasAny(user, "TIME_READ_TEAM")) {
        extras.push({ to: "/manager/time-report",    icon: FaClock,       label: "Team Time Report",    extra: true });
        extras.push({ to: "/manager/time-approvals", icon: FaCheckSquare, label: "Time Approvals",       extra: true });
    }

    // STAFF_READ_ALL / ACCESS_USER_DETAIL → manager staff view
    if (hasAny(user, "STAFF_READ_ALL", "ACCESS_USER_DETAIL")) {
        extras.push({ to: "/manager/staff", icon: FaUsers, label: "Staff", extra: true });
    }

    return extras;
}

/* =========================================================
   CUSTOMER
========================================================= */

const CUSTOMER_ITEMS = [
    { to: "/dashboard",               icon: FaHome,          label: "Dashboard" },
    { to: "/customer/create-case",    icon: FaPlusCircle,    label: "New Request" },
    { to: "/customer/my-cases",       icon: FaClipboardList, label: "My Cases" },
    { to: "/customer/notifications",  icon: FaBell,          label: "Notifications" },
    { to: "/customer/feedback",       icon: FaComments,      label: "Feedback" },
    { to: "/profile",                 icon: FaUserCircle,    label: "Profile" },
    { to: "/customer/change-password", icon: FaLock,         label: "Change Password" },
];

/* =========================================================
   COMPONENT
========================================================= */

export default function Sidebar({ collapsed, onToggle }) {
    const { user } = useAuth();

    const isCustomer = user?.partyType === "CUSTOMER" || user?.userType === "CUSTOMER" || user?.isCustomer;
    const isAdmin    = user?.isSAdmin || user?.role === "SYSTEM_ADMIN" || user?.userType === "SYSTEM_ADMIN";
    const isDirector = Boolean(user?.isDirector && !user?.isSAdmin && !user?.isPSsupport);
    const isManager  = Boolean(user?.isManager  && !user?.isSAdmin && !user?.isPSsupport);
    const isSupport  = Boolean(user?.isPSsupport && !user?.isSAdmin);

    let items;

    if (isCustomer) {
        items = CUSTOMER_ITEMS;
    } else if (isAdmin) {
        items = ADMIN_ITEMS;
    } else if (isDirector) {
        items = DIRECTOR_ITEMS;
    } else if (isManager) {
        // Managers get their base items + any extra permissions
        const base   = MANAGER_ITEMS(user);
        const extras = getExtraItemsForUser(user).filter(
            (e) => !base.some((b) => b.to === e.to)
        );
        items = [...base, ...extras];
    } else if (isSupport) {
        // Support agents get their base items + any extra permissions
        const base   = PS_SUPPORT_BASE;
        const extras = getExtraItemsForUser(user).filter(
            (e) => !base.some((b) => b.to === e.to)
        );
        items = [...base, ...extras];
    } else {
        items = ADMIN_ITEMS;
    }

    return (
        <SidebarShell
            items={items}
            collapsed={collapsed}
            onToggle={onToggle}
        />
    );
}
