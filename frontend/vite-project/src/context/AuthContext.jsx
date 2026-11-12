import { createContext, useEffect, useState } from "react";
import { jwtDecode } from "jwt-decode";
import { AuthApi } from "../api/authApi";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    // useEffect(() => {
    //     loadUser();
    // }, []);


    useEffect(() => {
        loadUser();

        const handleForcedLogout = () => setUser(null);
        window.addEventListener("auth:logout", handleForcedLogout);

        // Silently refresh permissions every 30 seconds so permission changes
        // granted by an admin take effect without requiring a manual logout.
        const permissionRefreshInterval = setInterval(async () => {
            try {
                const refreshedDecoded = await AuthApi.refresh();
                setUser((current) => current ? normalizeUser(refreshedDecoded) : null);
            } catch (_) {
                // If refresh fails, the interceptor will handle forced logout
            }
        }, 30 * 1000);

        return () => {
            window.removeEventListener("auth:logout", handleForcedLogout);
            clearInterval(permissionRefreshInterval);
        };
    }, []);

    function normalizeUser(rawUser) {
        const normalizedRole = rawUser?.role ||
            (rawUser?.isSAdmin ? "SYSTEM_ADMIN" :
            rawUser?.isDirector ? "DIRECTOR" :
            rawUser?.isManager || rawUser?.managerType ? "MANAGER" :
            rawUser?.isPSsupport ? "PS_SUPPORT" :
            rawUser?.userType || undefined);

        const staffRole = rawUser?.partyType === "STAFF" ||
            rawUser?.isSAdmin ||
            rawUser?.isManager ||
            rawUser?.isPSsupport ||
            rawUser?.isDirector ||
            rawUser?.managerType ||
            normalizedRole === "SYSTEM_ADMIN" ||
            normalizedRole === "MANAGER" ||
            normalizedRole === "DIRECTOR" ||
            normalizedRole === "PS_SUPPORT";

        const managerType = rawUser?.managerType ||
            (normalizedRole === "MANAGER" ? "SECTION" : null);

        return {
            ...rawUser,
            id: rawUser?.id || rawUser?.userId,
            partyType: rawUser?.partyType || (staffRole ? "STAFF" : "CUSTOMER"),
            role: normalizedRole,
            userType: rawUser?.userType || normalizedRole,
            managerType,
            isSAdmin: Boolean(rawUser?.isSAdmin || normalizedRole === "SYSTEM_ADMIN" || rawUser?.userType === "SYSTEM_ADMIN"),
            isManager: Boolean(rawUser?.isManager || rawUser?.managerType || normalizedRole === "MANAGER" || rawUser?.userType === "MANAGER"),
            isDirector: Boolean(rawUser?.isDirector || normalizedRole === "DIRECTOR" || rawUser?.userType === "DIRECTOR"),
            isPSsupport: Boolean(rawUser?.isPSsupport || normalizedRole === "PS_SUPPORT" || rawUser?.userType === "PS_SUPPORT"),
            firstName: rawUser?.firstName || "",
            lastName: rawUser?.lastName || "",
            email: rawUser?.email || "",
        };
    }

    // function loadUser() {
    //     try {
    //         const token = localStorage.getItem("jwt_token");

    //         if (!token) {
    //             setUser(null);
    //             setLoading(false);
    //             return;
    //         }

    //         const decoded = jwtDecode(token);
    //         const normalizedUser = normalizeUser(decoded);

    //         setUser(normalizedUser);
    //     } catch (error) {
    //         console.error(error);
    //         localStorage.removeItem("jwt_token");
    //         setUser(null);
    //     }

    //     setLoading(false);
    // }



    async function loadUser() {
        try {
            const token = localStorage.getItem("jwt_token");

            if (token) {
                try {
                    const decoded = jwtDecode(token);
                    const notExpired =
                        decoded.exp && decoded.exp * 1000 > Date.now() + 5000;

                    if (notExpired) {
                        // Set user immediately from cached token for fast UI render,
                        // then silently refresh in background to pick up any permission
                        // changes (e.g. admin granted/revoked a permission).
                        setUser(normalizeUser(decoded));

                        // Background refresh — updates permissions without blocking UI
                        try {
                            const refreshedDecoded = await AuthApi.refresh();
                            setUser(normalizeUser(refreshedDecoded));
                        } catch (_refreshErr) {
                            // Refresh failed (token was revoked) — force logout
                            localStorage.removeItem("jwt_token");
                            setUser(null);
                        }
                        return;
                    }
                } catch (_) {
                    // fall through to refresh
                }
            }

            // No token, or token expired -> restore the session from the
            // httpOnly refresh cookie.
            const decoded = await AuthApi.refresh();
            setUser(normalizeUser(decoded));
        } catch (error) {
            localStorage.removeItem("jwt_token");
            setUser(null);
        } finally {
            setLoading(false);
        }
    }


    async function login(credentials) {
        const decoded = await AuthApi.login(credentials);
        const normalizedUser = normalizeUser(decoded);

        setUser(normalizedUser);
        return normalizedUser;
    }

    // async function logout() {
    //     await AuthApi.logout();
    //     setUser(null);
    // }

     async function logout() {
        try {
            await AuthApi.logout();
        } finally {
            setUser(null);
        }
    }

    const value = {
        user,
        loading,
        login,
        logout,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}
