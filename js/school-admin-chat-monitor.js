
"use strict";

/* =========================================================
   ILABRAT STUDENTS
   SCHOOL ADMIN - TEACHER CHAT MONITOR
   مراقبة إدارية فقط دون الوصول إلى المحادثات
   ========================================================= */

(() => {
    const db = window.supabaseClient || window.db;

    const $ = (id) => document.getElementById(id);

    const state = {
        rooms: [],
        notifications: [],
        report: null,
        loading: false
    };

    const BAGHDAD_TIME_ZONE = "Asia/Baghdad";

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[char]);
    }

    function showMessage(message, type = "info") {
        const element = $("monitorMessage");
        if (!element) return;

        element.textContent = message;
        element.className = "monitor-message";

        if (type === "error") element.classList.add("error");
        if (type === "success") element.classList.add("success");

        element.hidden = false;
    }

    function hideMessage() {
        const element = $("monitorMessage");
        if (element) element.hidden = true;
    }

    function getBaghdadDate() {
        const parts = new Intl.DateTimeFormat("en-CA", {
            timeZone: BAGHDAD_TIME_ZONE,
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }).formatToParts(new Date());

        const values = {};
        for (const part of parts) {
            values[part.type] = part.value;
        }

        return `${values.year}-${values.month}-${values.day}`;
    }

    function formatDateTime(value) {
        if (!value) return "—";

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "—";

        return new Intl.DateTimeFormat("ar-IQ", {
            timeZone: BAGHDAD_TIME_ZONE,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true
        }).format(date);
    }

    function formatDuration(seconds) {
        const total = Math.max(0, Number(seconds) || 0);
        const hours = Math.floor(total / 3600);
        const minutes = Math.floor((total % 3600) / 60);
        const remainingSeconds = Math.floor(total % 60);

        if (hours > 0) {
            return `${hours} ساعة و${minutes} دقيقة`;
        }

        if (minutes > 0) {
            return `${minutes} دقيقة`;
        }

        return `${remainingSeconds} ثانية`;
    }

    function getElapsedSeconds(start, end = null) {
        if (!start) return 0;

        const startTime = new Date(start).getTime();
        const endTime = end ? new Date(end).getTime() : Date.now();

        if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
            return 0;
        }

        return Math.max(0, Math.floor((endTime - startTime) / 1000));
    }

    function normalizeResponse(data) {
        if (data && data.data && typeof data.data === "object") {
            return data.data;
        }
        return data || {};
    }

    async function invokeAction(action, extra = {}) {
        if (!db?.functions) {
            throw new Error("لم يتم العثور على اتصال Supabase.");
        }

        const { data, error } = await db.functions.invoke(
            "teacher-chat-handler",
            {
                body: {
                    action,
                    ...extra
                }
            }
        );

        if (error) {
            throw new Error(error.message || "تعذر الاتصال بخدمة غرف الأسئلة.");
        }

        if (!data) {
            throw new Error("لم تصل استجابة من خدمة غرف الأسئلة.");
        }

        if (data.success === false) {
            throw new Error(data.message || data.error || "تعذر تنفيذ الطلب.");
        }

        return normalizeResponse(data);
    }

    async function verifySchoolAdmin() {
        if (!db?.auth) {
            throw new Error("اتصال Supabase غير متاح.");
        }

        const { data: authData, error: authError } = await db.auth.getUser();

        if (authError || !authData?.user) {
            throw new Error("يرجى تسجيل الدخول أولاً.");
        }

        const { data: profile, error: profileError } = await db
            .from("profiles")
            .select("id, full_name, role")
            .eq("id", authData.user.id)
            .maybeSingle();

        if (profileError) throw profileError;

        if (!profile || profile.role !== "school_admin") {
            throw new Error("هذه الصفحة مخصصة لمدير المدرسة فقط.");
        }

        return profile;
    }

    function setStats(report) {
        const totals = report?.totals || {};

        $("statTeachers").textContent = totals.teachers_count ?? 0;
        $("statOpenedTeachers").textContent = totals.opened_teachers_count ?? 0;
        $("statNotOpenedTeachers").textContent = totals.not_opened_teachers_count ?? 0;
        $("statActiveRooms").textContent = totals.active_rooms_count ?? 0;
        $("statOpenedSessions").textContent = totals.opened_sessions_count ?? 0;
        $("statClosedSessions").textContent = totals.closed_sessions_count ?? 0;
    }

    function getRoomSessions(room) {
        return Array.isArray(room?.sessions) ? room.sessions : [];
    }

    function getSessionDuration(session) {
        if (session?.duration_seconds != null) {
            return Number(session.duration_seconds) || 0;
        }

        return getElapsedSeconds(
            session?.opened_at,
            session?.closed_at
        );
    }

    function getRoomDuration(room) {
        const sessions = getRoomSessions(room);

        if (sessions.length) {
            return sessions.reduce((total, session) => {
                return total + getSessionDuration(session);
            }, 0);
        }

        if (room?.duration_seconds != null) {
            return Number(room.duration_seconds) || 0;
        }

        return getElapsedSeconds(room?.opened_at, room?.closed_at);
    }

    function renderRooms() {
        const container = $("roomsContainer");
        const rooms = state.rooms;

        $("roomsCount").textContent = `${rooms.length} غرفة`;

        if (!rooms.length) {
            container.innerHTML = `
                <div class="monitor-empty">
                    لا توجد غرف مسجلة حالياً.
                </div>
            `;
            return;
        }

        container.innerHTML = rooms.map((room) => {
            const active = room.status === "active";
            const sessions = getRoomSessions(room);

            const sessionsHTML = sessions.length
                ? sessions.map((session) => `
                    <div class="session-row">
                        <span>
                            الفتح: ${escapeHTML(formatDateTime(session.opened_at))}
                        </span>
                        <span>
                            الإغلاق: ${escapeHTML(formatDateTime(session.closed_at))}
                        </span>
                        <strong>
                            ${escapeHTML(formatDuration(getSessionDuration(session)))}
                        </strong>
                    </div>
                `).join("")
                : `<div class="monitor-empty">لا يوجد سجل جلسات متاح.</div>`;

            const currentDuration = active
                ? getElapsedSeconds(room.opened_at)
                : getRoomDuration(room);

            return `
                <article class="room-monitor-card">
                    <h3>${escapeHTML(room.class_name || "صف غير محدد")}</h3>

                    <div class="room-monitor-details">
                        <div class="room-detail">
                            <span>المعلم</span>
                            <strong>${escapeHTML(room.teacher_name || "غير محدد")}</strong>
                        </div>

                        <div class="room-detail">
                            <span>المادة</span>
                            <strong>${escapeHTML(room.subject || "غير محددة")}</strong>
                        </div>

                        <div class="room-detail">
                            <span>وقت الفتح</span>
                            <strong>${escapeHTML(formatDateTime(room.opened_at))}</strong>
                        </div>

                        <div class="room-detail">
                            <span>وقت الإغلاق</span>
                            <strong>${escapeHTML(formatDateTime(room.closed_at))}</strong>
                        </div>

                        <div class="room-detail">
                            <span>مدة الغرفة</span>
                            <strong>${escapeHTML(formatDuration(currentDuration))}</strong>
                        </div>

                        <div class="room-detail">
                            <span>عدد الجلسات</span>
                            <strong>${sessions.length}</strong>
                        </div>
                    </div>

                    <span class="room-status ${active ? "active" : "closed"}">
                        ${active ? "● فعالة حالياً" : "● مغلقة"}
                    </span>

                    <div class="room-sessions">
                        <h4>سجل الجلسات</h4>
                        ${sessionsHTML}
                    </div>
                </article>
            `;
        }).join("");
    }

    function renderReport(report) {
        state.report = report;

        const teachers = Array.isArray(report?.teachers)
            ? report.teachers
            : [];

        const totals = report?.totals || {};

        setStats(report);

        $("reportSummary").innerHTML = `
            <span>التاريخ: ${escapeHTML(report?.report_date || $("reportDate").value)}</span>
            <span>عدد المعلمين: ${Number(totals.teachers_count || 0)}</span>
            <span>الجلسات المفتوحة: ${Number(totals.opened_sessions_count || 0)}</span>
            <span>الجلسات المغلقة: ${Number(totals.closed_sessions_count || 0)}</span>
            <span>الغرف الفعالة: ${Number(totals.active_rooms_count || 0)}</span>
            <span>إجمالي مدة الفتح: ${escapeHTML(formatDuration(totals.total_open_seconds || 0))}</span>
        `;

        const tbody = $("reportTableBody");

        if (!teachers.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="monitor-empty">
                        لا توجد بيانات لهذا اليوم.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = teachers.map((teacher) => {
            const opened = Number(teacher.opened_rooms_count || 0) > 0;
            const status = teacher.status || (opened ? "opened" : "not_opened");

            return `
                <tr>
                    <td>${escapeHTML(teacher.teacher_name || "غير محدد")}</td>
                    <td>${Number(teacher.opened_rooms_count || 0)}</td>
                    <td>${Number(teacher.closed_rooms_count || 0)}</td>
                    <td>${Number(teacher.active_rooms_count || 0)}</td>
                    <td>${escapeHTML(formatDuration(teacher.total_open_seconds || 0))}</td>
                    <td class="${opened ? "teacher-status-opened" : "teacher-status-not-opened"}">
                        ${status === "opened" || opened ? "فتح غرفة" : "لم يفتح غرفة"}
                    </td>
                </tr>
            `;
        }).join("");
    }

    function renderNotifications() {
        const container = $("notificationsContainer");
        const notifications = state.notifications;

        $("notificationsCount").textContent =
            `${notifications.length} إشعار`;

        if (!notifications.length) {
            container.innerHTML = `
                <div class="monitor-empty">لا توجد إشعارات حالياً.</div>
            `;
            return;
        }

        container.innerHTML = notifications.map((notification) => {
            const unread = !notification.is_read;

            return `
                <article class="notification-item ${unread ? "unread" : ""}">
                    <div class="notification-content">
                        <h3>${escapeHTML(notification.title || "إشعار غرفة")}</h3>
                        <p>${escapeHTML(notification.content || "")}</p>
                        <time>${escapeHTML(formatDateTime(notification.created_at))}</time>
                    </div>

                    ${
                        unread
                            ? `<button
                                class="notification-read-button"
                                data-notification-id="${escapeHTML(notification.id)}">
                                تحديد كمقروء
                               </button>`
                            : `<span class="monitor-count">تمت القراءة</span>`
                    }
                </article>
            `;
        }).join("");
    }

    async function loadRooms() {
        const result = await invokeAction("school_admin_rooms");

        state.rooms = Array.isArray(result.rooms)
            ? result.rooms
            : [];

        renderRooms();
    }

    async function loadNotifications() {
        const result = await invokeAction("school_admin_notifications");

        state.notifications = Array.isArray(result.notifications)
            ? result.notifications
            : [];

        renderNotifications();
    }

    async function loadReport() {
        const date = $("reportDate").value || getBaghdadDate();

        const result = await invokeAction("school_admin_daily_report", {
            report_date: date
        });

        renderReport(result);
    }

    async function refreshAll() {
        if (state.loading) return;

        state.loading = true;
        hideMessage();

        $("refreshMonitorButton").disabled = true;

        try {
            await Promise.all([
                loadRooms(),
                loadNotifications(),
                loadReport()
            ]);

            showMessage("تم تحديث بيانات المراقبة بنجاح.", "success");
        } catch (error) {
            console.error("ILABRAT monitor error:", error);
            showMessage(error.message || "حدث خطأ أثناء تحميل البيانات.", "error");
        } finally {
            state.loading = false;
            $("refreshMonitorButton").disabled = false;
        }
    }

    async function markNotificationRead(notificationId) {
        try {
            await invokeAction("mark_notification_read", {
                notification_id: notificationId
            });

            const item = state.notifications.find(
                (notification) => String(notification.id) === String(notificationId)
            );

            if (item) item.is_read = true;

            renderNotifications();
            showMessage("تم تحديد الإشعار كمقروء.", "success");
        } catch (error) {
            console.error(error);
            showMessage(error.message || "تعذر تحديث الإشعار.", "error");
        }
    }

    function exportExcel() {
        if (!window.XLSX) {
            showMessage("مكتبة Excel لم تُحمّل. تحقق من اتصال الإنترنت.", "error");
            return;
        }

        if (!state.report) {
            showMessage("اعرض التقرير أولاً قبل التصدير.", "error");
            return;
        }

        const report = state.report;
        const teachers = Array.isArray(report.teachers) ? report.teachers : [];

        const teacherRows = teachers.map((teacher) => ({
            "المعلم": teacher.teacher_name || "",
            "مرات الفتح": Number(teacher.opened_rooms_count || 0),
            "مرات الإغلاق": Number(teacher.closed_rooms_count || 0),
            "الغرف الفعالة": Number(teacher.active_rooms_count || 0),
            "مدة الفتح بالثواني": Number(teacher.total_open_seconds || 0),
            "مدة الفتح": formatDuration(teacher.total_open_seconds || 0),
            "الحالة": Number(teacher.opened_rooms_count || 0) > 0
                ? "فتح غرفة"
                : "لم يفتح غرفة"
        }));

        const roomRows = state.rooms.map((room) => ({
            "المعلم": room.teacher_name || "",
            "الصف": room.class_name || "",
            "المادة": room.subject || "",
            "الحالة": room.status === "active" ? "فعالة" : "مغلقة",
            "وقت الفتح": formatDateTime(room.opened_at),
            "وقت الإغلاق": formatDateTime(room.closed_at),
            "المدة بالثواني": getRoomDuration(room),
            "المدة": formatDuration(getRoomDuration(room))
        }));

        const sessionRows = [];

        state.rooms.forEach((room) => {
            getRoomSessions(room).forEach((session) => {
                sessionRows.push({
                    "المعلم": room.teacher_name || "",
                    "الصف": room.class_name || "",
                    "المادة": room.subject || "",
                    "وقت الفتح": formatDateTime(session.opened_at),
                    "وقت الإغلاق": formatDateTime(session.closed_at),
                    "المدة بالثواني": getSessionDuration(session),
                    "المدة": formatDuration(getSessionDuration(session)),
                    "الحالة": session.closed_at ? "مغلقة" : "فعالة"
                });
            });
        });

        const summaryRows = [{
            "التاريخ": report.report_date || $("reportDate").value,
            "عدد المعلمين": report.totals?.teachers_count || 0,
            "معلمون فتحوا غرفاً": report.totals?.opened_teachers_count || 0,
            "معلمون لم يفتحوا غرفاً": report.totals?.not_opened_teachers_count || 0,
            "الجلسات المفتوحة": report.totals?.opened_sessions_count || 0,
            "الجلسات المغلقة": report.totals?.closed_sessions_count || 0,
            "الغرف الفعالة": report.totals?.active_rooms_count || 0,
            "إجمالي مدة الفتح بالثواني": report.totals?.total_open_seconds || 0
        }];

        const workbook = XLSX.utils.book_new();

        const addSheet = (rows, name) => {
            const sheet = XLSX.utils.json_to_sheet(rows);
            XLSX.utils.book_append_sheet(workbook, sheet, name);
        };

        addSheet(summaryRows, "الملخص");
        addSheet(teacherRows, "ملخص المعلمين");
        addSheet(roomRows, "الغرف");
        addSheet(sessionRows, "سجل الجلسات");

        const date = report.report_date || $("reportDate").value || getBaghdadDate();

        XLSX.writeFile(
            workbook,
            `ILABRAT-Chat-Monitor-${date}.xlsx`
        );

        showMessage("تم تجهيز ملف Excel وتنزيله.", "success");
    }

    function bindEvents() {
        $("refreshMonitorButton").addEventListener("click", refreshAll);

        $("loadReportButton").addEventListener("click", async () => {
            try {
                hideMessage();
                await loadReport();
                showMessage("تم تحميل التقرير اليومي.", "success");
            } catch (error) {
                showMessage(error.message || "تعذر تحميل التقرير.", "error");
            }
        });

        $("exportExcelButton").addEventListener("click", exportExcel);

        $("notificationsContainer").addEventListener("click", (event) => {
            const button = event.target.closest("[data-notification-id]");
            if (!button) return;

            markNotificationRead(button.dataset.notificationId);
        });

        $("reportDate").addEventListener("change", () => {
            $("reportSummary").textContent =
                "اضغط عرض التقرير لتحميل بيانات التاريخ المحدد.";
        });
    }

    
async function initialize() {
    const reportDate = $("reportDate");
    const schoolName = $("schoolDisplayName");
    const adminName = $("adminDisplayName");

    if (reportDate) {
        reportDate.value = getBaghdadDate();
    }

    try {
        const profile = await verifySchoolAdmin();

        if (adminName && profile.full_name) {
            adminName.textContent = profile.full_name;
        }

        // تحميل اسم المدرسة من عضوية مدير المدرسة
        if (schoolName) {
            const { data: membership, error } = await db
                .from("school_memberships")
                .select("school_id, schools(name)")
                .eq("profile_id", profile.id)
                .eq("role", "school_admin")
                .maybeSingle();

            if (error) throw error;

            schoolName.textContent =
                membership?.schools?.name || "إدارة المدرسة";
        }

        bindEvents();
        await refreshAll();

    } catch (error) {
        console.error("ILABRAT monitor initialization:", error);

        showMessage(
            error.message || "تعذر فتح لوحة المراقبة.",
            "error"
        );

        const rooms = $("roomsContainer");

        if (rooms) {
            rooms.innerHTML = `
                <div class="monitor-empty">
                    تعذر تحميل بيانات غرف الأسئلة.
                </div>
            `;
        }
    }
}


    document.addEventListener("DOMContentLoaded", initialize);
})();
