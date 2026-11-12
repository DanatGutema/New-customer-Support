import {
    useEffect,
    useState,
} from "react";

import {
    useNavigate,
    useParams,
} from "react-router-dom";

import { useAuth } from "../../context/useAuth";

import {
    getAllCases,
    getCase,
} from "../../api/caseApi";

import { createCase } from "../../api/customerCaseApi";
import { getCategories, getSubcategories, getServiceTypes } from "../../api/productServiceApi";

import CaseStats from "../../components/cases/CaseStats";
import CaseFilters from "../../components/cases/CaseFilters";
import CaseTable from "../../components/cases/CaseTable";
import CaseDetailsDrawer from "../../components/cases/CaseDetailsDrawer";

import AssignStaffModal from "../../components/cases/AssignStaffModal";
import ChangePriorityModal from "../../components/cases/ChangePriorityModal";
import ResolveCaseModal from "../../components/cases/ResolveCaseModal";
import ReassignStaffModal from "../../components/cases/ReassignStaffModal";
import CancelCaseModal from "../../components/cases/CancelCaseModal";
import EscalateModal from "../../components/cases/EscalateModal";
import CloseCaseModal from "../../components/cases/CloseCaseModal";

import Pagination from "../../components/cases/Pagination";
import CaseSorting from "../../components/cases/CaseSorting";

import {
    RefreshCw,
    FileText,
    ClipboardList,
} from "lucide-react";

import AdminPageHero from "../../components/admin/AdminPageHero";


// ============================================================
// ADMIN CREATE CASE MODAL
// ============================================================

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_SIZE = 50 * 1024 * 1024;

function AdminCreateCaseModal({ open, onClose, onSubmitted }) {
    const [categories, setCategories] = useState([]);
    const [subcategories, setSubcategories] = useState([]);
    const [services, setServices] = useState([]);
    const [filteredSubcategories, setFilteredSubcategories] = useState([]);
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(false);
    const [form, setForm] = useState({
        customerEmail: "",
        reason: "",
        branchName: "",
        subject: "",
        description: "",
        productCategoryId: "",
        productSubcategoryId: "",
        serviceTypeId: "",
    });

    useEffect(() => {
        if (!open) return;
        const loadData = async () => {
            try {
                const [catRes, subRes, svcRes] = await Promise.all([
                    getCategories(true),   // activeOnly
                    getSubcategories(true),
                    getServiceTypes(),
                ]);
                const normalize = (res, keys) => {
                    for (const key of ["data", ...keys]) {
                        if (Array.isArray(res?.data?.[key])) return res.data[key];
                    }
                    return Array.isArray(res?.data) ? res.data : [];
                };
                setCategories(normalize(catRes, ["categories"]));
                setSubcategories(normalize(subRes, ["subcategories"]));
                setServices(normalize(svcRes, ["serviceTypes"]));
            } catch (err) {
                console.error("Admin create case — failed to load lookups:", err);
            }
        };
        loadData();
    }, [open]);

    const handleCategoryChange = (e) => {
        const id = e.target.value;
        setForm((f) => ({ ...f, productCategoryId: id, productSubcategoryId: "" }));
        setFilteredSubcategories(
            subcategories.filter((s) => {
                const cid = s.productCategoryId ?? s.categoryId ?? s.product_category_id;
                return String(cid) === String(id);
            })
        );
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const { customerEmail, reason, branchName, subject, description, productCategoryId, productSubcategoryId, serviceTypeId } = form;
        if (!customerEmail || !reason || !branchName || !subject || !description || !productCategoryId || !productSubcategoryId || !serviceTypeId) {
            alert("Please complete all required fields before submitting.");
            return;
        }
        if (reason.trim().length < 5) {
            alert("Reason must be at least 5 characters.");
            return;
        }
        if (files.length > MAX_ATTACHMENTS) {
            alert(`You can attach up to ${MAX_ATTACHMENTS} files.`);
            return;
        }
        try {
            setLoading(true);
            const data = new FormData();
            data.append("customerEmail", customerEmail.trim());
            data.append("reason", reason.trim());
            data.append("branchName", branchName);
            data.append("subject", subject);
            data.append("description", description);
            data.append("productCategoryId", productCategoryId);
            data.append("productSubcategoryId", productSubcategoryId);
            data.append("serviceTypeId", serviceTypeId);
            files.forEach((f) => data.append("attachments", f));

            await createCase(data, true);

            alert("Case logged successfully on behalf of the customer.");
            setForm({ customerEmail: "", reason: "", branchName: "", subject: "", description: "", productCategoryId: "", productSubcategoryId: "", serviceTypeId: "" });
            setFiles([]);
            setFilteredSubcategories([]);
            onSubmitted?.();
            onClose?.();
        } catch (err) {
            console.error("Admin case creation failed:", err?.response?.data || err);
            alert(err?.response?.data?.message || "Failed to create case.");
        } finally {
            setLoading(false);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
            <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
                <div className="mb-6 flex items-center justify-between gap-3">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600">Admin Action</p>
                        <h2 className="text-2xl font-bold text-slate-900">Open Case for Customer</h2>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100">Close</button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="grid gap-5 md:grid-cols-2">
                        <div className="md:col-span-2">
                            <label className="mb-1 block text-sm font-medium text-slate-700">Customer Email <span className="text-red-500">*</span></label>
                            <input type="email" className="w-full rounded-xl border border-slate-200 p-3 outline-none focus:border-blue-400" value={form.customerEmail} onChange={(e) => setForm((f) => ({ ...f, customerEmail: e.target.value }))} placeholder="customer@example.com" />
                        </div>

                        <div className="md:col-span-2">
                            <label className="mb-1 block text-sm font-medium text-slate-700">Reason for Opening Case <span className="text-red-500">*</span></label>
                            <textarea rows="2" className="w-full rounded-xl border border-slate-200 p-3 outline-none focus:border-blue-400" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Why is this case being opened on behalf of the customer? (min 5 chars)" />
                        </div>

                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">Branch Name <span className="text-red-500">*</span></label>
                            <input className="w-full rounded-xl border border-slate-200 p-3 outline-none focus:border-blue-400" value={form.branchName} onChange={(e) => setForm((f) => ({ ...f, branchName: e.target.value }))} />
                        </div>

                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">Case Subject <span className="text-red-500">*</span></label>
                            <input className="w-full rounded-xl border border-slate-200 p-3 outline-none focus:border-blue-400" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
                        </div>

                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">Category <span className="text-red-500">*</span></label>
                            <select className="w-full rounded-xl border border-slate-200 p-3 outline-none focus:border-blue-400" value={form.productCategoryId} onChange={handleCategoryChange}>
                                <option value="">Select Category</option>
                                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>

                        <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">Subcategory <span className="text-red-500">*</span></label>
                            <select className="w-full rounded-xl border border-slate-200 p-3 outline-none focus:border-blue-400" value={form.productSubcategoryId} onChange={(e) => setForm((f) => ({ ...f, productSubcategoryId: e.target.value }))} disabled={!filteredSubcategories.length}>
                                <option value="">Select Subcategory</option>
                                {filteredSubcategories.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>

                        <div className="md:col-span-2">
                            <label className="mb-1 block text-sm font-medium text-slate-700">Service Type <span className="text-red-500">*</span></label>
                            <select className="w-full rounded-xl border border-slate-200 p-3 outline-none focus:border-blue-400" value={form.serviceTypeId} onChange={(e) => setForm((f) => ({ ...f, serviceTypeId: e.target.value }))}>
                                <option value="">Select Service</option>
                                {services.map((s) => <option key={s.id} value={s.id}>{s.name || s.serviceName}</option>)}
                            </select>
                        </div>

                        <div className="md:col-span-2">
                            <label className="mb-1 block text-sm font-medium text-slate-700">Problem Description <span className="text-red-500">*</span></label>
                            <textarea rows="5" className="w-full rounded-xl border border-slate-200 p-3 outline-none focus:border-blue-400" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Describe the issue in detail..." />
                        </div>

                        <div className="md:col-span-2">
                            <label className="mb-1 block text-sm font-medium text-slate-700">Attachments (max {MAX_ATTACHMENTS}, 50MB each)</label>
                            <input type="file" multiple className="w-full rounded-xl border border-slate-200 p-3"
                                onChange={(e) => {
                                    const selected = Array.from(e.target.files || []);
                                    const merged = [...files, ...selected].slice(0, MAX_ATTACHMENTS);
                                    const oversized = merged.find((f) => f.size > MAX_ATTACHMENT_SIZE);
                                    if (oversized) { alert("Each file must be 50 MB or smaller."); return; }
                                    setFiles(merged);
                                }}
                            />
                            {files.length > 0 && (
                                <ul className="mt-2 space-y-1">
                                    {files.map((f, i) => (
                                        <li key={i} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                                            <span className="truncate">{f.name}</span>
                                            <button type="button" onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))} className="ml-3 rounded border border-slate-300 px-2 py-1 text-xs text-slate-500 hover:text-red-500">Remove</button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-5 py-2.5 font-medium text-slate-700 hover:bg-slate-100">Cancel</button>
                        <button type="submit" disabled={loading} className="rounded-xl bg-[#17345c] px-5 py-2.5 font-semibold text-white hover:bg-[#102949] disabled:opacity-60">
                            {loading ? "Submitting..." : "Submit Case"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}


// ============================================================
// PAGE
// ============================================================

export default function CaseTrackingPage() {

    const { user } = useAuth();

    const { id: routeCaseId } = useParams();

    const navigate = useNavigate();


    // ============================================================
    // CASE DATA
    // ============================================================

    const [cases, setCases] = useState([]);

    const [filteredCases, setFilteredCases] = useState([]);


    const [loading, setLoading] = useState(true);


    // ============================================================
    // SELECTED CASE
    // ============================================================

    const [selectedCase, setSelectedCase] = useState(null);


    // ============================================================
    // MODALS / DRAWERS
    // ============================================================

    const [details, setDetails] = useState(false);

    const [assign, setAssign] = useState(false);

    const [priority, setPriority] = useState(false);

    const [showResolve, setShowResolve] = useState(false);

    const [showReassign, setShowReassign] = useState(false);

    const [showCancel, setShowCancel] = useState(false);

    const [showEscalate, setShowEscalate] = useState(false);

    const [showClose, setShowClose] = useState(false);

    const [showCreateCase, setShowCreateCase] = useState(false);


    // ============================================================
    // SORTING
    // ============================================================

    const [sortBy, setSortBy] = useState("createdAt");

    const [order, setOrder] = useState("desc");


    // ============================================================
    // PAGINATION
    // ============================================================

    const [page, setPage] = useState(1);

    const [limit] = useState(15);


    const [pagination, setPagination] = useState({
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 1,
    });


    // ============================================================
    // REFRESH EVENT
    // ============================================================

    const notifyCaseDashboardRefresh = () => {

        window.dispatchEvent(
            new CustomEvent("cases:updated")
        );

    };


    // ============================================================
    // LOAD CASES
    // ============================================================

    const loadCases = async (isBackground = false) => {

        try {

            if (!isBackground) {
                setLoading(true);
            }


            const response = await getAllCases(
                page,
                limit,
                sortBy,
                order
            );


            const casesData =
                response?.data?.data || [];


            const paginationData =
                response?.data?.pagination || {
                    page: 1,
                    limit: 10,
                    total: 0,
                    totalPages: 1,
                };


            setCases(casesData);

            setFilteredCases(casesData);

            setPagination(paginationData);

        }

        catch (error) {

            console.error(
                "Loading cases failed:",
                error
            );

        }

        finally {

            setLoading(false);

        }

    };


    // ============================================================
    // LOAD CASES + AUTO REFRESH
    // ============================================================

    useEffect(() => {

        let intervalId = setInterval(() => {
            loadCases(true); // background refresh - no loading spinner
        }, 15000);

        loadCases();

        return () => {
            clearInterval(intervalId);
        };

    }, [
        page,
        sortBy,
        order,
    ]);


    // ============================================================
    // DEEP LINK — OPEN A CASE FROM /admin/cases/:id
    // ============================================================

    useEffect(() => {

        if (!routeCaseId) return;

        let cancelled = false;

        const openRouteCase = async () => {

            try {

                const response = await getCase(routeCaseId);

                const caseData =
                    response?.data?.data ||
                    response?.data ||
                    null;

                if (!cancelled) {

                    setSelectedCase(
                        caseData || { id: routeCaseId }
                    );

                    setDetails(true);

                }

            }

            catch (error) {

                console.error(
                    "Failed to open case from URL:",
                    error
                );

                if (!cancelled) {

                    setSelectedCase({ id: routeCaseId });

                    setDetails(true);

                }

            }

        };

        openRouteCase();

        return () => {
            cancelled = true;
        };

    }, [routeCaseId]);


    // ============================================================
    // CLOSE DETAILS (RETURN TO LIST WHEN DEEP LINKED)
    // ============================================================

    const closeDetails = () => {

        setDetails(false);

        if (routeCaseId) {

            navigate("/admin/cases", { replace: true });

        }

    };


    // ============================================================
    // FILTER
    // ============================================================

    const filterCases = ({
        search,
        status,
        priority,
    }) => {

        const normalize = (value) =>
            String(value || "")
                .toUpperCase()
                .trim();

        let result = [...cases];


        // SEARCH

        if (search) {

            const query =
                search.toLowerCase().trim();


            result = result.filter(
                (item) => {

                    const searchableText = `

                        ${item.caseNumber || ""}

                        ${item.subject || ""}

                        ${item.description || ""}

                        ${item.customer?.firstName || ""}

                        ${item.customer?.lastName || ""}

                        ${item.customer?.email || ""}

                        ${item.customer?.organization?.name || ""}

                    `.toLowerCase();


                    return searchableText.includes(
                        query
                    );

                }
            );

        }


        // STATUS

        if (
            status &&
            status !== "ALL"
        ) {

            result = result.filter(
                item => {

                    const itemStatus =
                        normalize(item.status);

                    if (
                        status ===
                        "AWAITING_CUSTOMER_RESPONSE"
                    ) {

                        return [
                            "AWAITING_CUSTOMER_RESPONSE",
                            "WAITING_CUSTOMER_FEEDBACK",
                            "AWAITING_CUSTOMER",
                            "AWAITING_CUSTOMER_FEEDBACK",
                        ].includes(itemStatus);

                    }

                    if (status === "CANCELLED") {

                        return (
                            itemStatus === "CANCELLED" ||
                            itemStatus === "CANCELED"
                        );

                    }


                    return itemStatus === status;

                }
            );

        }


        // PRIORITY

        if (
            priority &&
            priority !== "ALL"
        ) {

            result = result.filter(
                item =>
                    normalize(item.priority) ===
                    priority
            );

        }


        setFilteredCases(result);

    };


    // ============================================================
    // SORTING
    // ============================================================

    const handleSorting = (
        field,
        direction
    ) => {

        setSortBy(field);

        setOrder(direction);

        setPage(1);

    };


    // ============================================================
    // REFRESH
    // ============================================================

    const handleRefresh = async () => {

        await loadCases();

    };


    // ============================================================
    // RENDER
    // ============================================================

    return (

        <div
            className="
                min-h-screen
                space-y-6
                bg-slate-50/50
                pb-8
            "
        >


            {/* =====================================================
                PAGE HEADER
            ===================================================== */}

            <AdminPageHero
                eyebrow="Case Management"
                title="All support cases"
                description="Track, filter and review every support case across the organization."
                icon={FileText}
            />



            {/* =====================================================
                CASE STATISTICS
            ===================================================== */}

            <section>

                <CaseStats
                    cases={cases}
                    total={pagination.total}
                />

            </section>



            {/* =====================================================
                CASE HISTORY
            ===================================================== */}

            <section
                className="
                    overflow-hidden
                    rounded-2xl
                    border
                    border-slate-200
                    bg-white
                "
            >


                {/* =================================================
                    HEADER
                ================================================= */}

                <div
                    className="
                        border-b
                        border-slate-100
                        px-5
                        py-5
                    "
                >

                    <div
                        className="
                            flex
                            flex-col
                            gap-4
                            lg:flex-row
                            lg:items-center
                            lg:justify-between
                        "
                    >

                        {/* LEFT */}

                        <div
                            className="
                                flex
                                min-w-0
                                items-start
                                gap-3
                            "
                        >

                            <div
                                className="
                                    flex
                                    h-9
                                    w-9
                                    shrink-0
                                    items-center
                                    justify-center
                                    rounded-xl
                                    bg-blue-50
                                    text-blue-600
                                "
                            >

                                <FileText
                                    size={17}
                                    strokeWidth={1.8}
                                />

                            </div>


                            <div>

                                <div
                                    className="
                                        flex
                                        items-center
                                        gap-2
                                    "
                                >

                                    <span
                                        className="
                                            text-[10px]
                                            font-bold
                                            uppercase
                                            tracking-[0.14em]
                                            text-blue-600
                                        "
                                    >
                                        Case Management
                                    </span>


                                    <span
                                        className="
                                            h-1
                                            w-1
                                            rounded-full
                                            bg-slate-300
                                        "
                                    />


                                    <span
                                        className="
                                            text-[11px]
                                            font-medium
                                            text-slate-400
                                        "
                                    >
                                        {cases.length}{" "}
                                        {cases.length === 1
                                            ? "case"
                                            : "cases"}
                                    </span>

                                </div>


                                <h2
                                    className="
                                        mt-1
                                        text-base
                                        font-semibold
                                        text-slate-900
                                    "
                                >
                                    Your case history
                                </h2>


                                <p
                                    className="
                                        mt-1
                                        text-xs
                                        text-slate-400
                                    "
                                >
                                    Review previously handled
                                    cases and their latest status.
                                </p>

                            </div>

                        </div>



                        {/* RIGHT — REFRESH + OPEN CASE */}

                        <div className="flex items-center gap-2 self-start lg:self-center">

                        <button
                            type="button"
                            onClick={() => setShowCreateCase(true)}
                            className="
                                inline-flex
                                h-9
                                shrink-0
                                items-center
                                justify-center
                                gap-2
                                rounded-lg
                                bg-emerald-600
                                px-3.5
                                text-xs
                                font-semibold
                                text-white
                                shadow-sm
                                transition-all
                                duration-200
                                hover:bg-emerald-700
                            "
                        >
                            <ClipboardList size={14} strokeWidth={2} />
                            Open Case
                        </button>

                        <button
                            type="button"
                            onClick={handleRefresh}
                            disabled={loading}
                            className="
                                inline-flex
                                h-9
                                shrink-0
                                items-center
                                justify-center
                                gap-2
                                rounded-lg
                                bg-[#17345c]
                                px-3.5
                                text-xs
                                font-semibold
                                text-white
                                shadow-sm
                                transition-all
                                duration-200
                                hover:bg-[#102949]
                                disabled:cursor-not-allowed
                                disabled:opacity-60
                            "
                        >

                            <RefreshCw
                                size={14}
                                strokeWidth={2}
                                className={
                                    loading
                                        ? "animate-spin"
                                        : ""
                                }
                            />

                            Refresh

                        </button>

                        </div>

                    </div>


                    {/* =================================================
                        SEARCH + FILTER + SORT
                    ================================================= */}

                    <div
                        className="
                            mt-5
                            flex
                            flex-col
                            gap-2
                            lg:flex-row
                            lg:items-center
                        "
                    >

                        {/* GLOBAL SEARCH */}

                        <div
                            className="
                                min-w-0
                                flex-1
                            "
                        >

                            <CaseFilters
                                onFilter={
                                    filterCases
                                }
                            />

                        </div>


                        {/* SORTING */}

                        <div
                            className="
                                shrink-0
                            "
                        >

                            <CaseSorting
                                sortBy={
                                    sortBy
                                }
                                order={
                                    order
                                }
                                onSortChange={
                                    handleSorting
                                }
                            />

                        </div>

                    </div>

                </div>



                {/* =================================================
                    TABLE META
                ================================================= */}

                <div
                    className="
                        flex
                        items-center
                        justify-between
                        border-b
                        border-slate-100
                        bg-slate-50/40
                        px-5
                        py-2.5
                    "
                >

                    <div
                        className="
                            flex
                            items-center
                            gap-2
                            text-[11px]
                            font-medium
                            text-slate-400
                        "
                    >

                        <span
                            className="
                                h-1.5
                                w-1.5
                                rounded-full
                                bg-emerald-500
                            "
                        />

                        {filteredCases.length}{" "}
                        {filteredCases.length === 1
                            ? "case"
                            : "cases"}

                    </div>


                    <div
                        className="
                            text-[11px]
                            text-slate-400
                        "
                    >

                        {filteredCases.length} of{" "}
                        {cases.length} shown

                    </div>

                </div>



                {/* =================================================
                    TABLE
                ================================================= */}

                <div>

                    {loading ? (

                        <div className="divide-y divide-slate-100">

                            <div className="hidden items-center gap-4 bg-slate-50/60 px-5 py-3 sm:flex">

                                {[160, 120, 90, 80, 70, 90].map(
                                    (width, index) => (
                                        <div
                                            key={index}
                                            className="h-2.5 animate-pulse rounded bg-slate-200"
                                            style={{ width }}
                                        />
                                    )
                                )}

                            </div>

                            {[1, 2, 3, 4, 5].map((row) => (
                                <div
                                    key={row}
                                    className="flex items-center gap-4 px-5 py-4"
                                >
                                    <div className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-slate-100" />

                                    <div className="min-w-0 flex-1 space-y-2">
                                        <div className="h-3 w-2/5 animate-pulse rounded bg-slate-100" />
                                        <div className="h-2.5 w-1/4 animate-pulse rounded bg-slate-50" />
                                    </div>

                                    <div className="hidden h-6 w-20 animate-pulse rounded-full bg-slate-100 sm:block" />

                                    <div className="hidden h-6 w-16 animate-pulse rounded-full bg-slate-100 md:block" />

                                    <div className="h-8 w-8 animate-pulse rounded-lg bg-slate-100" />
                                </div>
                            ))}

                            <div className="flex min-h-[40px] items-center justify-center gap-2 text-xs text-slate-400">
                                <RefreshCw
                                    size={14}
                                    className="animate-spin"
                                />
                                Loading cases...
                            </div>

                        </div>

                    ) : (

                        <CaseTable
                            cases={
                                filteredCases
                            }

                            permissions={
                                user?.permissions ||
                                []
                            }

                            onView={(item) => {

                                setSelectedCase(
                                    item
                                );

                                setDetails(
                                    true
                                );

                            }}

                            onAssign={(item) => {

                                setSelectedCase(
                                    item
                                );

                                setAssign(
                                    true
                                );

                            }}

                            onResolve={(item) => {

                                setSelectedCase(
                                    item
                                );

                                setShowResolve(
                                    true
                                );

                            }}

                            onReassign={(item) => {

                                setSelectedCase(
                                    item
                                );

                                setShowReassign(
                                    true
                                );

                            }}

                            onPriority={(item) => {

                                setSelectedCase(
                                    item
                                );

                                setPriority(
                                    true
                                );

                            }}

                            onCancel={(item) => {

                                setSelectedCase(
                                    item
                                );

                                setShowCancel(
                                    true
                                );

                            }}

                            onEscalate={(item) => {

                                setSelectedCase(
                                    item
                                );

                                setShowEscalate(
                                    true
                                );

                            }}

                            onClose={(item) => {

                                setSelectedCase(
                                    item
                                );

                                setShowClose(
                                    true
                                );

                            }}

                        />

                    )}

                </div>



                {/* =================================================
                    PAGINATION
                ================================================= */}

                <div
                    className="
                        border-t
                        border-slate-100
                        px-5
                        py-3
                    "
                >

                    <Pagination
                        page={
                            pagination.page
                        }

                        totalPages={
                            pagination.totalPages
                        }

                        onPageChange={
                            setPage
                        }
                    />

                </div>

            </section>



            {/* =====================================================
                DETAILS DRAWER
            ===================================================== */}

            {details && (

                <CaseDetailsDrawer
                    caseData={
                        selectedCase
                    }

                    close={closeDetails}
                />

            )}



            {/* =====================================================
                ASSIGN
            ===================================================== */}

            {assign && (

                <AssignStaffModal
                    caseData={
                        selectedCase
                    }

                    refresh={async () => {

                        await loadCases();

                        notifyCaseDashboardRefresh();

                    }}

                    close={() =>
                        setAssign(false)
                    }
                />

            )}



            {/* =====================================================
                RESOLVE
            ===================================================== */}

            {showResolve && (

                <ResolveCaseModal
                    caseData={
                        selectedCase
                    }

                    refresh={async () => {

                        await loadCases();

                        notifyCaseDashboardRefresh();

                    }}

                    close={() =>
                        setShowResolve(false)
                    }
                />

            )}



            {/* =====================================================
                REASSIGN
            ===================================================== */}

            {showReassign && (

                <ReassignStaffModal
                    caseData={
                        selectedCase
                    }

                    refresh={async () => {

                        await loadCases();

                        notifyCaseDashboardRefresh();

                    }}

                    close={() =>
                        setShowReassign(false)
                    }
                />

            )}



            {/* =====================================================
                PRIORITY
            ===================================================== */}

            {priority && (

                <ChangePriorityModal
                    caseData={
                        selectedCase
                    }

                    refresh={async () => {

                        await loadCases();

                        notifyCaseDashboardRefresh();

                    }}

                    close={() =>
                        setPriority(false)
                    }
                />

            )}

            {/* =====================================================
                CANCEL
            ===================================================== */}

            {showCancel && (

                <CancelCaseModal
                    caseData={
                        selectedCase
                    }

                    refresh={async () => {

                        await loadCases();

                        notifyCaseDashboardRefresh();

                    }}

                    close={() =>
                        setShowCancel(false)
                    }
                />

            )}

            {/* =====================================================
                ESCALATE
            ===================================================== */}

            {showEscalate && (

                <EscalateModal
                    caseData={
                        selectedCase
                    }

                    refresh={async () => {

                        await loadCases();

                        notifyCaseDashboardRefresh();

                    }}

                    close={() =>
                        setShowEscalate(false)
                    }
                />

            )}

            {/* =====================================================
                CLOSE
            ===================================================== */}

            {showClose && (

                <CloseCaseModal
                    caseData={
                        selectedCase
                    }

                    refresh={async () => {

                        await loadCases();

                        notifyCaseDashboardRefresh();

                    }}

                    close={() =>
                        setShowClose(false)
                    }
                />

            )}

            {/* =====================================================
                ADMIN CREATE CASE
            ===================================================== */}

            <AdminCreateCaseModal
                open={showCreateCase}
                onClose={() => setShowCreateCase(false)}
                onSubmitted={() => {
                    setShowCreateCase(false);
                    loadCases();
                    notifyCaseDashboardRefresh();
                }}
            />

        </div>

    );

}
