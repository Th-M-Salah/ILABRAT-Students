
"use strict";

/* =========================================================
   ILABRAT STUDENTS
   SCHOOL ADMIN - TEACHER CHAT MONITOR

   الوظائف:
   - مراقبة غرف الأسئلة والجلسات.
   - عرض الإشعارات غير المقروءة فقط.
   - إزالة الإشعار من القائمة بعد تحديده كمقروء.
   - تحديث بيانات اليوم حسب توقيت بغداد.
   - عرض التقرير اليومي.
   - تصدير التقرير اليومي إلى Excel.
   - المحافظة على سجلات الغرف والجلسات السابقة.
   ========================================================= */

(() => {
    const db = window.supabaseClient || window.db;
    const $ = (id) => document.getElementById(id);

    const state = {
        rooms: [],
        notifications: [],
        report: null,
        loading: false,
        pendingNotifications: new Set(),
        lastLoadedBaghdadDate: null
    };

    const BAGHDAD_TIME_ZONE = "Asia/Baghdad";
    let dayCheckInterval = null;

    /* =====================================================
       أدوات عامة
       ===================================================== */

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

        if (type === "error") {
            element.classList.add("error");
        } else if (type === "success") {
            element.classList.add("success");
        }

        element.hidden = false;
    }

    function hideMessage() {
        const element = $("monitorMessage");
        if (element) element.hidden = true;
    }

    function setText(id, value) {
        const element = $(id);
        if (element) element.textContent = value;
    }

    /* =====================================================
       توقيت بغداد
       ===================================================== */

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

    /* =====================================================
       حساب المدد
       ===================================================== */

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

        if (
            !Number.isFinite(startTime) ||
            !Number.isFinite(endTime)
        ) {
            return 0;
        }

        return Math.max(
            0,
            Math.floor((endTime - startTime) / 1000)
        );
    }

    /* =====================================================
       التعامل مع استجابة Supabase
       ===================================================== */

    function normalizeResponse(data) {
        if (
            data &&
            data.data &&
            typeof data.data === "object"
        ) {
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
            throw new Error(
                error.message || "تعذر الاتصال بخدمة غرف الأسئلة."
            );
        }

        if (!data) {
            throw new Error("لم تصل استجابة من خدمة غرف الأسئلة.");
        }

        if (data.success === false) {
            throw new Error(
                data.message ||
                data.error ||
                "تعذر تنفيذ الطلب."
            );
        }

        return normalizeResponse(data);
    }

    /* =====================================================
       التحقق من مدير المدرسة
       ===================================================== */

    async function verifySchoolAdmin() {
        if (!db?.auth) {
            throw new Error("اتصال Supabase غير متاح.");
        }

        const {
            data: authData,
            error: authError
        } = await db.auth.getUser();

        if (authError || !authData?.user) {
            throw new Error("يرجى تسجيل الدخول أولاً.");
        }

        const {
            data: profile,
            error: profileError
        } = await db
            .from("profiles")
            .select("id, full_name, role")
            .eq("id", authData.user.id)
            .maybeSingle();

        if (profileError) throw profileError;

        if (!profile || profile.role !== "school_admin") {
            throw new Error(
                "هذه الصفحة مخصصة لمدير المدرسة فقط."
            );
        }

        return profile;
    }

    /* =====================================================
       الإحصائيات
       ===================================================== */

    function setStats(report) {
        const totals = report?.totals || {};

        setText("statTeachers", totals.teachers_count ?? 0);
        setText("statOpenedTeachers", totals.opened_teachers_count ?? 0);
        setText("statNotOpenedTeachers", totals.not_opened_teachers_count ?? 0);
        setText("statActiveRooms", totals.active_rooms_count ?? 0);
        setText("statOpenedSessions", totals.opened_sessions_count ?? 0);
        setText("statClosedSessions", totals.closed_sessions_count ?? 0);
    }

    /* =====================================================
       بيانات الجلسات والغرف
       ===================================================== */

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

        return getElapsedSeconds(
            room?.opened_at,
            room?.closed_at
        );
    }

    /* =====================================================
       عرض الغرف الحالية
       ===================================================== */

    function renderRooms() {
        const container = $("roomsContainer");
        if (!container) return;

        const rooms = state.rooms;

        setText("roomsCount", `${rooms.length} غرفة`);

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
                            الفتح:
                            ${escapeHTML(formatDateTime(session.opened_at))}
                        </span>

                        <span>
                            الإغلاق:
                            ${escapeHTML(formatDateTime(session.closed_at))}
                        </span>

                        <strong>
                            ${escapeHTML(formatDuration(
                                getSessionDuration(session)
                            ))}
                        </strong>
                    </div>
                `).join("")
                : `
                    <div class="monitor-empty">
                        لا يوجد سجل جلسات متاح.
                    </div>
                `;

            const currentDuration = active
                ? getElapsedSeconds(room.opened_at)
                : getRoomDuration(room);

            return `
                <article class="room-monitor-card">
                    <h3>
                        ${escapeHTML(room.class_name || "صف غير محدد")}
                    </h3>

                    <div class="room-monitor-details">
                        <div class="room-detail">
                            <span>المعلم</span>
                            <strong>
                                ${escapeHTML(room.teacher_name || "غير محدد")}
                            </strong>
                        </div>

                        <div class="room-detail">
                            <span>المادة</span>
                            <strong>
                                ${escapeHTML(room.subject || "غير محددة")}
                            </strong>
                        </div>

                        <div class="room-detail">
                            <span>وقت الفتح</span>
                            <strong>
                                ${escapeHTML(formatDateTime(room.opened_at))}
                            </strong>
                        </div>

                        <div class="room-detail">
                            <span>وقت الإغلاق</span>
                            <strong>
                                ${escapeHTML(formatDateTime(room.closed_at))}
                            </strong>
                        </div>

                        <div class="room-detail">
                            <span>مدة الغرفة</span>
                            <strong>
                                ${escapeHTML(formatDuration(currentDuration))}
                            </strong>
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

    /* =====================================================
       عرض التقرير اليومي
       ===================================================== */

    function renderReport(report) {
        state.report = report;

        const teachers = Array.isArray(report?.teachers)
            ? report.teachers
            : [];

        const totals = report?.totals || {};

        setStats(report);

        const summary = $("reportSummary");

        if (summary) {
            summary.innerHTML = `
                <span>
                    التاريخ:
                    ${escapeHTML(
                        report?.report_date ||
                        $("reportDate")?.value ||
                        getBaghdadDate()
                    )}
                </span>

                <span>
                    عدد المعلمين:
                    ${Number(totals.teachers_count || 0)}
                </span>

                <span>
                    الجلسات المفتوحة:
                    ${Number(totals.opened_sessions_count || 0)}
                </span>

                <span>
                    الجلسات المغلقة:
                    ${Number(totals.closed_sessions_count || 0)}
                </span>

                <span>
                    الغرف الفعالة:
                    ${Number(totals.active_rooms_count || 0)}
                </span>

                <span>
                    إجمالي مدة الفتح:
                    ${escapeHTML(formatDuration(
                        totals.total_open_seconds || 0
                    ))}
                </span>
            `;
        }

        const tbody = $("reportTableBody");
        if (!tbody) return;

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
            const opened =
                Number(teacher.opened_rooms_count || 0) > 0;

            const status = teacher.status ||
                (opened ? "opened" : "not_opened");

            return `
                <tr>
                    <td>
                        ${escapeHTML(teacher.teacher_name || "غير محدد")}
                    </td>

                    <td>
                        ${Number(teacher.opened_rooms_count || 0)}
                    </td>

                    <td>
                        ${Number(teacher.closed_rooms_count || 0)}
                    </td>

                    <td>
                        ${Number(teacher.active_rooms_count || 0)}
                    </td>

                    <td>
                        ${escapeHTML(formatDuration(
                            teacher.total_open_seconds || 0
                        ))}
                    </td>

                    <td class="${
                        opened
                            ? "teacher-status-opened"
                            : "teacher-status-not-opened"
                    }">
                        ${
                            status === "opened" || opened
                                ? "فتح غرفة"
                                : "لم يفتح غرفة"
                        }
                    </td>
                </tr>
            `;
        }).join("");
    }

    /* =====================================================
       عرض الإشعارات غير المقروءة فقط
       ===================================================== */

    function renderNotifications() {
        const container = $("notificationsContainer");
        if (!container) return;

        const notifications = state.notifications;

        setText(
            "notificationsCount",
            `${notifications.length} إشعار`
        );

        if (!notifications.length) {
            container.innerHTML = `
                <div class="monitor-empty">
                    لا توجد إشعارات جديدة.
                </div>
            `;
            return;
        }

        container.innerHTML = notifications.map((notification) => {
            const id = String(notification.id);
            const pending = state.pendingNotifications.has(id);

            return `
                <article class="notification-item unread">
                    <div class="notification-content">
                        <h3>
                            ${escapeHTML(notification.title || "إشعار غرفة")}
                        </h3>

                        <p>
                            ${escapeHTML(notification.content || "")}
                        </p>

                        <time>
                            ${escapeHTML(formatDateTime(notification.created_at))}
                        </time>
                    </div>

                    <button
                        type="button"
                        class="notification-read-button"
                        data-notification-id="${escapeHTML(id)}"
                        ${pending ? "disabled" : ""}
                    >
                        ${pending ? "جارٍ التحديث..." : "تحديد كمقروء"}
                    </button>
                </article>
            `;
        }).join("");
    }

    /* =====================================================
       تحميل الغرف
       ===================================================== */

    async function loadRooms() {
        const result = await invokeAction("school_admin_rooms");

        state.rooms = Array.isArray(result.rooms)
            ? result.rooms
            : [];

        renderRooms();
    }

    /* =====================================================
       تحميل الإشعارات
       ===================================================== */

    async function loadNotifications() {
        const result = await invokeAction(
            "school_admin_notifications"
        );

        state.notifications = Array.isArray(result.notifications)
            ? result.notifications.filter(
                notification => !notification.is_read
            )
            : [];

        renderNotifications();
    }

    /* =====================================================
       تحميل التقرير اليومي
       ===================================================== */

    async function loadReport() {
        const date = $("reportDate")?.value || getBaghdadDate();

        const result = await invokeAction(
            "school_admin_daily_report",
            {
                report_date: date
            }
        );

        renderReport(result);
    }

    /* =====================================================
       تحديث جميع البيانات
       ===================================================== */

    async function refreshAll() {
        if (state.loading) return;

        state.loading = true;
        hideMessage();

        const refreshButton = $("refreshMonitorButton");

        if (refreshButton) {
            refreshButton.disabled = true;
        }

        try {
            await Promise.all([
                loadRooms(),
                loadNotifications(),
                loadReport()
            ]);

            showMessage(
                "تم تحديث بيانات المراقبة بنجاح.",
                "success"
            );
        } catch (error) {
            console.error("ILABRAT monitor error:", error);

            showMessage(
                error.message || "حدث خطأ أثناء تحميل البيانات.",
                "error"
            );
        } finally {
            state.loading = false;

            if (refreshButton) {
                refreshButton.disabled = false;
            }
        }
    }

    /* =====================================================
       تحديد الإشعار كمقروء وإزالته من القائمة
       ===================================================== */

    async function markNotificationRead(notificationId) {
        const id = String(notificationId);

        if (state.pendingNotifications.has(id)) {
            return;
        }

        state.pendingNotifications.add(id);
        renderNotifications();

        try {
            await invokeAction(
                "mark_notification_read",
                {
                    notification_id: notificationId
                }
            );

            // إزالة الإشعار من واجهة المدير بعد نجاح العملية
            state.notifications = state.notifications.filter(
                notification => String(notification.id) !== id
            );

            renderNotifications();

            showMessage(
                "تمت قراءة الإشعار وإزالته من القائمة.",
                "success"
            );
        } catch (error) {
            console.error("Mark notification read error:", error);

            showMessage(
                error.message || "تعذر تحديث الإشعار.",
                "error"
            );

            renderNotifications();
        } finally {
            state.pendingNotifications.delete(id);
        }
    }

    /* =====================================================
       تصدير التقرير اليومي إلى Excel
       ===================================================== */

    function exportExcel() {
        if (!window.XLSX) {
            showMessage(
                "مكتبة Excel لم تُحمّل. تحقق من اتصال الإنترنت.",
                "error"
            );
            return;
        }

        if (!state.report) {
            showMessage(
                "اعرض التقرير أولاً قبل التصدير.",
                "error"
            );
            return;
        }

        try {
            const report = state.report;
            const teachers = Array.isArray(report.teachers)
                ? report.teachers
                : [];

            const totals = report.totals || {};

            const date =
                report.report_date ||
                $("reportDate")?.value ||
                getBaghdadDate();

            const workbook = XLSX.utils.book_new();

            /* الورقة الأولى: التقرير اليومي الكامل */

            const dailyReportData = [
                ["التقرير اليومي", "", "", "", "", ""],
                ["إحصائيات التزام المعلمين حسب توقيت بغداد", "", "", "", "", ""],
                [],
                [
                    "التاريخ",
                    date,
                    "عدد المعلمين",
                    Number(totals.teachers_count || 0),
                    "معلمون فتحوا غرفاً",
                    Number(totals.opened_teachers_count || 0)
                ],
                [
                    "الجلسات المفتوحة",
                    Number(totals.opened_sessions_count || 0),
                    "الجلسات المغلقة",
                    Number(totals.closed_sessions_count || 0),
                    "الغرف الفعالة",
                    Number(totals.active_rooms_count || 0)
                ],
                [
                    "إجمالي مدة الفتح",
                    formatDuration(totals.total_open_seconds || 0),
                    "إجمالي مدة الفتح بالثواني",
                    Number(totals.total_open_seconds || 0),
                    "",
                    ""
                ],
                [],
                [
                    "المعلم",
                    "مرات الفتح",
                    "مرات الإغلاق",
                    "الغرف الفعالة",
                    "إجمالي مدة الفتح",
                    "الحالة"
                ],
                ...teachers.map((teacher) => {
                    const opened =
                        Number(teacher.opened_rooms_count || 0);

                    const status = teacher.status ||
                        (opened > 0 ? "opened" : "not_opened");

                    return [
                        teacher.teacher_name || "غير محدد",
                        opened,
                        Number(teacher.closed_rooms_count || 0),
                        Number(teacher.active_rooms_count || 0),
                        formatDuration(teacher.total_open_seconds || 0),
                        status === "opened" || opened > 0
                            ? "فتح غرفة"
                            : "لم يفتح غرفة"
                    ];
                })
            ];

            const dailySheet = XLSX.utils.aoa_to_sheet(
                dailyReportData
            );

            dailySheet["!cols"] = [
                { wch: 30 },
                { wch: 22 },
                { wch: 22 },
                { wch: 20 },
                { wch: 25 },
                { wch: 22 }
            ];

            dailySheet["!merges"] = [
                {
                    s: { r: 0, c: 0 },
                    e: { r: 0, c: 5 }
                },
                {
                    s: { r: 1, c: 0 },
                    e: { r: 1, c: 5 }
                }
            ];

            dailySheet["!autofilter"] = {
                ref: `A8:F${Math.max(8, dailyReportData.length)}`
            };

            XLSX.utils.book_append_sheet(
                workbook,
                dailySheet,
                "التقرير اليومي"
            );

            /* الورقة الثانية: ملخص الإحصائيات */

            const summaryRows = [{
                "التاريخ": date,
                "عدد المعلمين": Number(totals.teachers_count || 0),
                "معلمون فتحوا غرفاً": Number(totals.opened_teachers_count || 0),
                "معلمون لم يفتحوا غرفاً": Number(totals.not_opened_teachers_count || 0),
                "الجلسات المفتوحة": Number(totals.opened_sessions_count || 0),
                "الجلسات المغلقة": Number(totals.closed_sessions_count || 0),
                "الغرف الفعالة": Number(totals.active_rooms_count || 0),
                "إجمالي مدة الفتح بالثواني": Number(totals.total_open_seconds || 0),
                "إجمالي مدة الفتح": formatDuration(totals.total_open_seconds || 0)
            }];

            XLSX.utils.book_append_sheet(
                workbook,
                XLSX.utils.json_to_sheet(summaryRows),
                "الملخص"
            );

            /* الورقة الثالثة: تفاصيل المعلمين */

            const teacherDetails = teachers.map((teacher) => ({
                "المعلم": teacher.teacher_name || "غير محدد",
                "مرات الفتح": Number(teacher.opened_rooms_count || 0),
                "مرات الإغلاق": Number(teacher.closed_rooms_count || 0),
                "الغرف الفعالة": Number(teacher.active_rooms_count || 0),
                "مدة الفتح بالثواني": Number(teacher.total_open_seconds || 0),
                "إجمالي مدة الفتح": formatDuration(teacher.total_open_seconds || 0),
                "الحالة": Number(teacher.opened_rooms_count || 0) > 0
                    ? "فتح غرفة"
                    : "لم يفتح غرفة"
            }));

            XLSX.utils.book_append_sheet(
                workbook,
                XLSX.utils.json_to_sheet(teacherDetails),
                "ملخص المعلمين"
            );

            /* الورقة الرابعة: الغرف */

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

            XLSX.utils.book_append_sheet(
                workbook,
                XLSX.utils.json_to_sheet(roomRows),
                "الغرف"
            );

            /* الورقة الخامسة: سجل الجلسات */

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

            XLSX.utils.book_append_sheet(
                workbook,
                XLSX.utils.json_to_sheet(sessionRows),
                "سجل الجلسات"
            );

            XLSX.writeFile(
                workbook,
                `ILABRAT-التقرير-اليومي-${date}.xlsx`
            );

            showMessage(
                "تم تصدير التقرير اليومي وجميع تفاصيله إلى Excel بنجاح.",
                "success"
            );
        } catch (error) {
            console.error("Excel export error:", error);

            showMessage(
                error.message || "حدث خطأ أثناء تصدير ملف Excel.",
                "error"
            );
        }
    }

    /* =====================================================
       مراقبة تغير اليوم حسب توقيت بغداد
       ===================================================== */

    function checkBaghdadDayChange() {
        const currentDate = getBaghdadDate();

        if (!state.lastLoadedBaghdadDate) {
            state.lastLoadedBaghdadDate = currentDate;
            return;
        }

        if (currentDate === state.lastLoadedBaghdadDate) {
            return;
        }

        state.lastLoadedBaghdadDate = currentDate;

        const reportDate = $("reportDate");

        if (reportDate) {
            reportDate.value = currentDate;
        }

        state.report = null;

        if (!state.loading) {
            refreshAll().then(() => {
                showMessage(
                    "بدأ يوم جديد، وتم تحديث بيانات مراقبة غرف الأسئلة.",
                    "success"
                );
            });
        }
    }

    /* =====================================================
       ربط الأحداث
       ===================================================== */

    function bindEvents() {
        const refreshButton = $("refreshMonitorButton");
        const loadReportButton = $("loadReportButton");
        const exportButton = $("exportExcelButton");
        const notificationsContainer = $("notificationsContainer");
        const reportDate = $("reportDate");

        if (refreshButton) {
            refreshButton.addEventListener("click", refreshAll);
        }

        if (loadReportButton) {
            loadReportButton.addEventListener("click", async () => {
                try {
                    hideMessage();
                    await loadReport();

                    showMessage(
                        "تم تحميل التقرير اليومي.",
                        "success"
                    );
                } catch (error) {
                    showMessage(
                        error.message || "تعذر تحميل التقرير.",
                        "error"
                    );
                }
            });
        }

        if (exportButton) {
            exportButton.addEventListener("click", exportExcel);
        }

        if (notificationsContainer) {
            notificationsContainer.addEventListener("click", (event) => {
                const button = event.target.closest(
                    "[data-notification-id]"
                );

                if (!button) return;

                markNotificationRead(
                    button.dataset.notificationId
                );
            });
        }

        if (reportDate) {
            reportDate.addEventListener("change", () => {
                const summary = $("reportSummary");

                if (summary) {
                    summary.textContent =
                        "اضغط عرض التقرير لتحميل بيانات التاريخ المحدد.";
                }
            });
        }
    }

    /* =====================================================
       تهيئة الصفحة
       ===================================================== */

    async function initialize() {
        const reportDate = $("reportDate");
        const schoolName = $("schoolDisplayName");
        const adminName = $("adminDisplayName");

        if (reportDate) {
            reportDate.value = getBaghdadDate();
        }

        state.lastLoadedBaghdadDate = getBaghdadDate();

        try {
            const profile = await verifySchoolAdmin();

            if (adminName && profile.full_name) {
                adminName.textContent = profile.full_name;
            }

            // تحميل اسم المدرسة من عضوية مدير المدرسة
            if (schoolName) {
                const {
                    data: membership,
                    error
                } = await db
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

            // فحص تغير التاريخ كل 30 ثانية
            if (dayCheckInterval) {
                clearInterval(dayCheckInterval);
            }

            dayCheckInterval = setInterval(
                checkBaghdadDayChange,
                30000
            );

        } catch (error) {
            console.error(
                "ILABRAT monitor initialization:",
                error
            );

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

    document.addEventListener(
        "DOMContentLoaded",
        initialize
    );

})();
