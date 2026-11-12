import { useEffect, useMemo, useState } from "react";
import {
    Building2,
    LayoutGrid,
    Search,
    Globe2,
    Pencil,
    Loader2,
} from "lucide-react";

import { OrganizationApi } from "../../api/organizationApi";

import AdminPageHero from "../../components/admin/AdminPageHero";

import OrganizationStatistics from "../../components/organization/OrganizationStatistics";
import OrganizationForm from "../../components/organization/OrganizationForm";
import OrganizationTable from "../../components/organization/OrganizationTable";
import OrganizationSearch from "../../components/organization/OrganizationSearch";
import EmptyOrganization from "../../components/organization/EmptyOrganization";


// ============================================================
// EDIT ORGANIZATION MODAL
// ============================================================
function EditOrganizationModal({ organization, onClose, onSaved }) {
    const [name, setName] = useState(organization?.name || "");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    async function handleSubmit(e) {
        e.preventDefault();
        if (!name.trim()) {
            setError("Organization name is required.");
            return;
        }
        try {
            setLoading(true);
            setError("");
            await OrganizationApi.update(organization.id, { name: name.trim() });
            onSaved();
        } catch (err) {
            setError(
                err?.response?.data?.message ||
                "Unable to update the organization. Please try again."
            );
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">

                {/* header */}
                <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                        <Pencil className="h-5 w-5" />
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-slate-900">Edit Organization</h2>
                        <p className="mt-0.5 text-xs text-slate-400">Update the organization name.</p>
                    </div>
                </div>

                {/* form */}
                <form onSubmit={handleSubmit}>
                    <div className="p-6 space-y-4">
                        <div>
                            <label className="mb-2 block text-xs font-semibold text-slate-700">
                                Organization Name <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                                <Building2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    required
                                    value={name}
                                    onChange={(e) => { setName(e.target.value); if (error) setError(""); }}
                                    disabled={loading}
                                    className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-100 disabled:bg-slate-50"
                                />
                            </div>
                        </div>

                        {/* email domain — read-only info */}
                        {organization?.emailDomains?.length > 0 && (
                            <div>
                                <label className="mb-2 block text-xs font-semibold text-slate-700">
                                    Email Domains
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {organization.emailDomains.map((d) => (
                                        <span key={d.id || d.domain} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
                                            <Globe2 className="h-3 w-3 text-slate-400" />
                                            {d.domain}
                                        </span>
                                    ))}
                                </div>
                                <p className="mt-1.5 text-[11px] text-slate-400">
                                    Email domains are managed on the organization detail page.
                                </p>
                            </div>
                        )}

                        {error && (
                            <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3">
                                <p className="text-xs font-medium text-red-600">{error}</p>
                            </div>
                        )}
                    </div>

                    {/* footer */}
                    <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={loading}
                            className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading || !name.trim()}
                            className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {loading ? (
                                <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
                            ) : (
                                <><Pencil className="h-4 w-4" /> Save Changes</>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default function OrganizationPage() {
    const [organizations, setOrganizations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [editingOrg, setEditingOrg] = useState(null);

    useEffect(() => {
        loadOrganizations();
    }, []);

    async function loadOrganizations() {
        try {
            setLoading(true);

            const response = await OrganizationApi.getAll();
            const list = response.data.data || [];

            setOrganizations(list);

            window.localStorage.setItem(
                "partner_support_organizations",
                JSON.stringify(list)
            );

            window.dispatchEvent(
                new CustomEvent("organizations:updated", {
                    detail: list,
                })
            );
        } catch (error) {
            console.log("Load organizations error", error);
        } finally {
            setLoading(false);
        }
    }

    async function createOrganization(data) {
        try {
            await OrganizationApi.create(data);
            await loadOrganizations();
        } catch (error) {
            console.log("Create organization error", error);
            throw error;
        }
    }

    async function deactivateOrganization(id) {
        try {
            await OrganizationApi.deactivate(id);
            await loadOrganizations();
        } catch (error) {
            console.log("Deactivate organization error", error);
        }
    }

    async function reactivateOrganization(id) {
        try {
            await OrganizationApi.reactivate(id);
            await loadOrganizations();
        } catch (error) {
            console.log("Reactivate organization error", error);
        }
    }

    const filteredOrganizations = useMemo(() => {
        const query = search.trim().toLowerCase();

        if (!query) {
            return organizations;
        }

        return organizations.filter((item) =>
            item.name?.toLowerCase().includes(query)
        );
    }, [organizations, search]);

    /* =========================================================
       LOADING
    ========================================================= */
    if (loading) {
        return (
            <div className="space-y-7">
                <div className="relative overflow-hidden rounded-[24px] border border-[#dce4ee] bg-[#0b1b33] px-6 py-8 sm:px-8">
                    <div className="space-y-4">
                        <div className="h-2.5 w-24 rounded bg-white/10" />
                        <div className="h-9 w-80 max-w-full rounded bg-white/15" />
                        <div className="h-4 w-[420px] max-w-full rounded bg-white/10" />
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {[1, 2, 3, 4].map((item) => (
                        <div
                            key={item}
                            className="h-36 animate-pulse rounded-2xl border border-slate-200 bg-white"
                        />
                    ))}
                </div>

                <div className="h-48 animate-pulse rounded-2xl border border-slate-200 bg-white" />

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
                    {[1, 2, 3].map((item) => (
                        <div
                            key={item}
                            className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white"
                        />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-7">

            {/* =====================================================
                PAGE HEADER
            ===================================================== */}
                        <AdminPageHero
              eyebrow="Administration"
              title="Organization Management"
              description="Create, manage, and monitor customer organizations from one centralized workspace."
              icon={Building2}
              right={
                <div className="w-full sm:w-[350px]">
                  <OrganizationSearch search={search} setSearch={setSearch} />
                </div>
              }
            />

            {/* =====================================================
                STATISTICS
            ===================================================== */}
            <OrganizationStatistics
                organizations={organizations}
            />

            {/* =====================================================
                CREATE ORGANIZATION
            ===================================================== */}
            <OrganizationForm
                onSubmit={createOrganization}
            />

            {/* =====================================================
                ORGANIZATION DIRECTORY HEADER
            ===================================================== */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">

                <div>
                    <div className="flex items-center gap-2">
                        <LayoutGrid className="h-4 w-4 text-slate-500" />

                        <h2 className="text-base font-semibold text-slate-900">
                            Organization Directory
                        </h2>
                    </div>

                    <p className="mt-1 text-xs text-slate-400">
                        {search ? (
                            <>
                                Showing{" "}
                                <span className="font-semibold text-slate-600">
                                    {filteredOrganizations.length}
                                </span>{" "}
                                matching organization
                                {filteredOrganizations.length === 1
                                    ? ""
                                    : "s"}
                            </>
                        ) : (
                            <>
                                {organizations.length} organization
                                {organizations.length === 1
                                    ? ""
                                    : "s"}{" "}
                                registered in the system
                            </>
                        )}
                    </p>
                </div>

                {search && (
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                        <Search className="h-3.5 w-3.5" />

                        <span>
                            Search results for{" "}
                            <span className="font-semibold text-slate-600">
                                "{search}"
                            </span>
                        </span>
                    </div>
                )}
            </div>

            {/* =====================================================
                ORGANIZATIONS
            ===================================================== */}
            {filteredOrganizations.length === 0 ? (
                <EmptyOrganization />
            ) : (
                <OrganizationTable
                    organizations={filteredOrganizations}
                    onDeactivate={deactivateOrganization}
                    onReactivate={reactivateOrganization}
                    onEdit={(org) => setEditingOrg(org)}
                />
            )}

            {/* =====================================================
                EDIT MODAL
            ===================================================== */}
            {editingOrg && (
                <EditOrganizationModal
                    organization={editingOrg}
                    onClose={() => setEditingOrg(null)}
                    onSaved={() => {
                        setEditingOrg(null);
                        loadOrganizations();
                    }}
                />
            )}
        </div>
    );
}
