"use strict";

/* =========================================================
   ILABRAT STUDENTS — STUDENT PORTAL
   Daily / Weekly / Account / School Announcements / Chat
   Optimized version
   ========================================================= */

(() => {
    const db = window.supabaseClient || window.db;
    const CHAT_FUNCTION = "teacher-chat-handler";
    const $ = id => document.getElementById(id);

    const DAYS = [
        { id: "sun", name: "الأحد", color: "blue" },
        { id: "mon", name: "الاثنين", color: "teal" },
        { id: "tue", name: "الثلاثاء", color: "purple" },
        { id: "wed", name: "الأربعاء", color: "green" },
        { id: "thu", name: "الخميس", color: "orange" }
    ];

    const state = {
        user: null,
        student: null,
        profile: null,
        classItem: null,
        school: null,

        lessons: [],
        posts: [],
        postsError: "",
        postsLoaded: false,
        postsLoading: false,
        homeworkMap: new Map(),

        announcements: [],
        announcementsError: "",
        announcementsLoaded: false,
        announcementsLoading: false,
        announcementsPromise: null,
        announcementsRead: false,

        currentDayIndex: 0,
        currentView: "daily",
        academicYear: "",

        chatRooms: [],
        selectedChatRoom: null,
        chatMessages: [],
        chatLoading: false,
        chatSending: false,
        chatRoomsLoaded: false,
        chatRoomsPromise: null
    };

    const elements = {
        welcomeStudentName: $("welcomeStudentName"),
        welcomeSchoolName: $("welcomeSchoolName"),
        accountContent: $("accountContent"),
        currentDayTitle: $("currentDayTitle"),
        currentDate: $("currentDate"),
        dayContent: $("dayContent"),
        dayPosition: $("dayPosition"),
        previousDay: $("previousDay"),
        nextDay: $("nextDay"),
        weeklyClassInfo: $("weeklyClassInfo"),
        weeklyContainer: document.querySelector(".weekly-table-wrapper"),
        announcementsContent: $("announcementsContent"),
        announcementCount: $("announcementCount"),
        imageViewer: $("imageViewer"),
        viewerImage: $("viewerImage"),
        viewerCaption: $("viewerCaption"),
        logoutButton: $("logoutButton"),
        logoutDialog: $("logoutDialog"),
        logoutDialogMessage: $("logoutDialogMessage"),
        logoutDialogError: $("logoutDialogError"),
        cancelLogoutButton: $("cancelLogoutButton"),
        confirmLogoutButton: $("confirmLogoutButton"),
        chatOpenCount: $("chatOpenCount"),
        chatRoomsList: $("studentChatRoomsList"),
        chatMessages: $("studentChatMessages"),
        chatRoomTitle: $("studentChatRoomTitle"),
        chatRoomMeta: $("studentChatRoomMeta"),
        chatRoomStatus: $("studentChatRoomStatus"),
        chatMessageForm: $("studentChatMessageForm"),
        chatMessageInput: $("studentChatMessageInput"),
        chatSendButton: $("studentChatSendButton"),
        chatRefreshButton: $("refreshStudentChatRooms"),
        chatFormMessage: $("studentChatFormMessage")
    };

    /* -------------------- HELPERS -------------------- */

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]);
    }

    function formatArabicDigits(value) {
        return String(value).replace(/\d/g, digit =>
            "٠١٢٣٤٥٦٧٨٩"[Number(digit)]
        );
    }

    function normalizeTime(value) {
        return String(value || "").slice(0, 5);
    }

    function formatTime(value) {
        const time = normalizeTime(value);
        if (!/^\d{2}:\d{2}$/.test(time)) return "غير محدد";

        const [hourString, minute] = time.split(":");
        const hour = Number(hourString);
        const period = hour < 12 ? "صباحاً" : "مساءً";
        const displayHour = hour % 12 || 12;

        return `${formatArabicDigits(displayHour)}:${formatArabicDigits(minute)} ${period}`;
    }

    function getPeriodNumber(value) {
        const match = String(value ?? "").match(/\d+/);
        return match ? Number(match[0]) : 0;
    }

    function localDateString(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    }

    function parseLocalDate(value) {
        if (!value) return null;

        const parts = String(value).slice(0, 10).split("-").map(Number);

        if (parts.length !== 3 || parts.some(Number.isNaN)) {
            return null;
        }

        return new Date(parts[0], parts[1] - 1, parts[2], 12);
    }

    function getWeekDates() {
        const today = new Date();

        const sunday = new Date(
            today.getFullYear(),
            today.getMonth(),
            today.getDate(),
            12
        );

        sunday.setDate(sunday.getDate() - sunday.getDay());

        return DAYS.map((day, index) => {
            const date = new Date(sunday);
            date.setDate(sunday.getDate() + index);

            return {
                ...day,
                date: localDateString(date)
            };
        });
    }

    function formatDate(value, includeDay = true) {
        const date = parseLocalDate(value);
        if (!date) return "";

        return new Intl.DateTimeFormat("ar-IQ", {
            weekday: includeDay ? "long" : undefined,
            year: "numeric",
            month: "long",
            day: "numeric"
        }).format(date);
    }

    function getAcademicYear() {
        const now = new Date();
        const year = now.getFullYear();

        return now.getMonth() >= 8
            ? `${year}-${year + 1}`
            : `${year - 1}-${year}`;
    }

    function safeImageUrl(value) {
        if (!value) return "";

        try {
            const url = new URL(String(value), window.location.origin);

            return ["https:", "http:"].includes(url.protocol)
                ? url.href
                : "";

        } catch {
            return "";
        }
    }

    function showError(container, message) {
        if (!container) return;

        container.innerHTML = `
            <div class="empty-state error-state">
                <span class="empty-state-icon">!</span>
                <h3>تعذر تحميل البيانات</h3>
                <p>${escapeHTML(message)}</p>
            </div>
        `;
    }

    function showEmpty(container, title, message) {
        if (!container) return;

        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-state-icon">✦</span>
                <h3>${escapeHTML(title)}</h3>
                <p>${escapeHTML(message)}</p>
            </div>
        `;
    }

    function getStudentDisplayName() {
        return state.profile?.full_name || "الطالب";
    }

    function getClassDisplayName() {
        const item = state.classItem;
        if (!item) return "غير محدد";

        return [
            item.stage || "",
            item.grade_name || item.name || "",
            item.gender || "",
            item.section_name ? `الشعبة ${item.section_name}` : ""
        ].filter(Boolean).join(" · ");
    }

    function compareLessons(a, b) {
        const periodDifference =
            getPeriodNumber(a.period) - getPeriodNumber(b.period);

        if (periodDifference !== 0) return periodDifference;

        return normalizeTime(a.start_time).localeCompare(
            normalizeTime(b.start_time)
        );
    }

    function getDayLessons(dayId) {
        return state.lessons
            .filter(lesson => lesson.day_of_week === dayId)
            .sort(compareLessons);
    }

    function getPostDate(post) {
        return String(post.target_date || post.created_at || "").slice(0, 10);
    }

    /* -------------------- WEEKLY DESIGN STYLES -------------------- */

    function injectWeeklyStyles() {
        if ($("ilabratWeeklyDesignStyles")) return;

        const style = document.createElement("style");
        style.id = "ilabratWeeklyDesignStyles";

        style.textContent = `
    .weekly-table-wrapper {
        width: 100%;
        overflow-x: auto;
        overflow-y: visible;
        border: 1px solid #e7ded8;
        border-radius: 10px;
        background: #fff;
        direction: rtl;
    }

    .weekly-classic-table {
        width: 100%;
        min-width: 650px;
        border-collapse: collapse;
        table-layout: fixed;
        direction: rtl;
        background: #fff;
    }

    .weekly-classic-table th,
    .weekly-classic-table td {
        border: 1px solid #e5dcd6;
        padding: 7px 5px;
        text-align: center;
        vertical-align: middle;
    }

    .weekly-classic-table thead th {
        background: #5A1825;
        color: #fff;
        font-size: 12px;
        font-weight: 800;
        padding: 9px 5px;
    }

    .weekly-classic-table thead th:first-child {
        width: 85px;
        background: #43131D;
    }

    .weekly-classic-table tbody th {
        background: #F3EEE7;
        color: #5A1825;
        font-size: 11px;
        font-weight: 800;
        width: 85px;
    }

    .weekly-period-number {
        display: block;
        font-size: 11px;
    }

    .weekly-period-time {
        display: block;
        margin-top: 3px;
        color: #7A2A39;
        font-size: 9px;
        font-weight: 700;
        line-height: 1.4;
        direction: rtl;
    }

    .weekly-classic-table tbody td {
        min-height: 65px;
        height: 65px;
        background: #fff;
    }

    .weekly-classic-table .weekly-today-column {
        background: #F3EEE7 !important;
    }

    .weekly-classic-table thead th.weekly-today-column {
        background: #C7A56A !important;
        color: #43131D !important;
    }

    .weekly-classic-table tbody td.weekly-today-column {
        box-shadow: inset 0 0 0 1px rgba(199, 165, 106, .35);
    }

    .weekly-classic-table .weekly-day-date {
        display: block;
        margin-top: 3px;
        color: rgba(255,255,255,.8);
        font-size: 9px;
        font-weight: 400;
    }

    .weekly-classic-table th.weekly-today-column .weekly-day-date {
        color: #43131D;
    }

    .weekly-cell-lesson {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 3px;
        min-height: 55px;
        padding: 3px 1px;
    }

    .weekly-cell-subject {
        color: #5A1825;
        font-size: 12px;
        font-weight: 800;
        line-height: 1.4;
        overflow-wrap: anywhere;
    }

    .weekly-cell-teacher {
        color: #75696c;
        font-size: 10px;
        line-height: 1.4;
        overflow-wrap: anywhere;
    }

    .weekly-cell-time {
        color: #7A2A39;
        font-size: 9px;
        font-weight: 800;
        line-height: 1.4;
        direction: rtl;
    }

    .weekly-cell-empty {
        color: #c2b8b3;
        font-size: 14px;
    }

    .weekly-empty-state {
        padding: 20px;
        border: 1px solid #eee4e2;
        border-radius: 10px;
        background: #fff;
        color: #75696c;
        text-align: center;
    }

    .weekly-empty-state.error-state {
        color: #a12b38;
    }

    @media (max-width: 600px) {
        .weekly-classic-table {
            min-width: 620px;
        }

        .weekly-classic-table th,
        .weekly-classic-table td {
            padding: 6px 3px;
        }

        .weekly-classic-table thead th {
            font-size: 10px;
            padding: 7px 3px;
        }

        .weekly-classic-table thead th:first-child,
        .weekly-classic-table tbody th {
            width: 75px;
        }

        .weekly-classic-table tbody th {
            font-size: 10px;
        }

        .weekly-period-time {
            font-size: 8px;
        }

        .weekly-cell-lesson {
            min-height: 48px;
        }

        .weekly-cell-subject {
            font-size: 10px;
        }

        .weekly-cell-teacher {
            font-size: 9px;
        }

        .weekly-cell-time {
            font-size: 8px;
        }

        .weekly-classic-table .weekly-day-date {
            font-size: 8px;
        }
    }
`;

        document.head.appendChild(style);
    }

    /* -------------------- LOAD STUDENT -------------------- */

    async function loadStudentData() {
        const { data: authData, error: authError } =
            await db.auth.getUser();

        if (authError) throw authError;

        state.user = authData?.user;

        if (!state.user) {
            window.location.replace("index.html");
            return false;
        }

        const { data: student, error: studentError } = await db
            .from("students")
            .select("id, profile_id, class_id")
            .eq("profile_id", state.user.id)
            .maybeSingle();

        if (studentError) throw studentError;

        if (!student?.class_id) {
            throw new Error(
                "هذا الحساب غير مرتبط بصف وشعبة. يرجى مراجعة إدارة المدرسة."
            );
        }

        state.student = student;

        const { data: classItem, error: classError } = await db
            .from("classes")
            .select("id, school_id, name, stage, grade_name, gender, section_name")
            .eq("id", student.class_id)
            .maybeSingle();

        if (classError) throw classError;

        if (!classItem) {
            throw new Error("تعذر العثور على الشعبة المرتبطة بحسابك.");
        }

        state.classItem = classItem;

        // الملف الشخصي والمدرسة مستقلان بعد معرفة الشعبة؛ تحميلهما بالتوازي.
        const profilePromise = db
            .from("profiles")
            .select("id, full_name")
            .eq("id", state.user.id)
            .maybeSingle();

        const schoolPromise = classItem.school_id
            ? db
                .from("schools")
                .select("id, name")
                .eq("id", classItem.school_id)
                .maybeSingle()
            : Promise.resolve({
                data: null,
                error: null
            });

        const [profileResult, schoolResult] = await Promise.all([
            profilePromise,
            schoolPromise
        ]);

        if (profileResult.error) {
            console.warn(
                "Student profile query:",
                profileResult.error
            );
        }

        state.profile = profileResult.data || {};

        if (schoolResult.error) {
            console.error("STUDENT SCHOOL QUERY ERROR:", {
                schoolId: classItem.school_id,
                error: schoolResult.error
            });

            state.school = null;

        } else {
            state.school = schoolResult.data || null;

            if (classItem.school_id && !state.school) {
                console.warn(
                    "لم يتم العثور على مدرسة مرتبطة بالشعبة:",
                    classItem.school_id
                );
            }
        }

        if (!classItem.school_id) {
            console.warn(
                "الشعبة لا تحتوي على school_id:",
                classItem.id
            );
        }

        return true;
    }

    /* -------------------- LOAD PUBLISHED TIMETABLE -------------------- */

    async function loadTimetable() {
        const expectedYear = getAcademicYear();
        state.academicYear = expectedYear;

        let { data, error } = await db
            .from("timetable_lessons")
            .select(`
                id, class_id, school_id, academic_year, day_of_week,
                period, subject, teacher_name, start_time, end_time,
                note, is_published
            `)
            .eq("school_id", state.classItem.school_id)
            .eq("class_id", state.classItem.id)
            .eq("academic_year", expectedYear)
            .eq("is_published", true)
            .order("period", { ascending: true });
                    if (error) throw error;

        if (!data?.length) {
            const fallback = await db
                .from("timetable_lessons")
                .select(`
                    id, class_id, school_id, academic_year, day_of_week,
                    period, subject, teacher_name, start_time, end_time,
                    note, is_published
                `)
                .eq("school_id", state.classItem.school_id)
                .eq("class_id", state.classItem.id)
                .eq("is_published", true)
                .order("period", { ascending: true });

            if (fallback.error) throw fallback.error;

            const available = fallback.data || [];

            if (available.length) {
                const years = [
                    ...new Set(
                        available
                            .map(item => item.academic_year)
                            .filter(Boolean)
                    )
                ].sort().reverse();

                if (years.length) {
                    state.academicYear = years[0];

                    data = available.filter(
                        item => item.academic_year === state.academicYear
                    );

                } else {
                    data = available;
                }

            } else {
                data = [];
            }
        }

        state.lessons = (data || []).filter(lesson =>
            DAYS.some(day => day.id === lesson.day_of_week)
        );

        if (elements.weeklyClassInfo) {
            elements.weeklyClassInfo.textContent =
                `${getClassDisplayName()} · السنة الدراسية ${state.academicYear}`;
        }
    }

    /* -------------------- LOAD HOMEWORK ONLY -------------------- */

    function buildHomeworkMap() {
        const map = new Map();

        state.posts.forEach(post => {
            if (post.post_type !== "teacher_homework") return;

            const subject = String(post.subject || "").trim();
            const date = getPostDate(post);

            if (!subject || !date) return;

            const key = `${date}::${subject}`;

            // الاحتفاظ بأول واجب مطابق كما كان find يفعل.
            if (!map.has(key)) {
                map.set(key, post);
            }
        });

        state.homeworkMap = map;
    }

    async function loadPosts() {
        if (state.postsLoaded || state.postsLoading) return;

        state.postsLoading = true;
        state.postsError = "";

        try {
            const { data, error } = await db.functions.invoke(
                "homework-handler",
                {
                    body: {
                        action: "student_posts"
                    }
                }
            );

            if (error) throw error;

            if (!data?.success) {
                throw new Error(
                    data?.message ||
                    data?.error ||
                    "لم تتمكن الخدمة من تحميل واجبات الشعبة."
                );
            }

            state.posts = (
                Array.isArray(data.posts) ? data.posts : []
            ).filter(post =>
                post.post_type !== "school_announcement"
            );

            buildHomeworkMap();
            state.postsLoaded = true;

        } catch (homeworkError) {
            console.error(
                "STUDENT HOMEWORK ERROR:",
                homeworkError
            );

            state.posts = [];
            state.homeworkMap.clear();
            state.postsError =
                homeworkError?.message || "تعذر تحميل الواجبات.";

        } finally {
            state.postsLoading = false;

            if (state.currentView === "daily") {
                renderDaily();
            }
        }
    }

    /* -------------------- WELCOME / ACCOUNT -------------------- */

    function renderWelcome() {
        if (elements.welcomeStudentName) {
            elements.welcomeStudentName.textContent =
                getStudentDisplayName();
        }

        if (elements.welcomeSchoolName) {
            elements.welcomeSchoolName.textContent =
                state.school?.name ||
                "نتمنى لك يوماً دراسياً موفقاً";
        }
    }

    function renderAccount() {
        if (!elements.accountContent) return;

        const info = [
            {
                label: "اسم الطالب",
                value: getStudentDisplayName(),
                icon: "♙"
            },
            {
                label: "اسم المدرسة",
                value: state.school?.name || "غير متاح",
                icon: "⌂"
            },
            {
                label: "المرحلة",
                value: state.classItem?.stage || "غير محددة",
                icon: "▤"
            },
            {
                label: "الصف",
                value: state.classItem?.grade_name ||
                    state.classItem?.name ||
                    "غير محدد",
                icon: "▦"
            },
            {
                label: "الشعبة",
                value: state.classItem?.section_name
                    ? `الشعبة ${state.classItem.section_name}`
                    : "غير محددة",
                icon: "▧"
            },
            {
                label: "الجنس",
                value: state.classItem?.gender || "غير محدد",
                icon: "♧"
            }
        ];

        elements.accountContent.innerHTML = info.map(item => `
            <article class="account-item">
                <span class="account-item-icon">${item.icon}</span>
                <div>
                    <span class="account-item-label">
                        ${escapeHTML(item.label)}
                    </span>
                    <strong>${escapeHTML(item.value)}</strong>
                </div>
            </article>
        `).join("");

        renderWelcome();
    }

    /* -------------------- HOMEWORK MATCHING -------------------- */

    function getHomeworkForLesson(lesson, date) {
        const key =
            `${date}::${String(lesson.subject || "").trim()}`;

        return state.homeworkMap.get(key) || null;
    }

    function renderLesson(lesson, index, selectedDate) {
        const homework = getHomeworkForLesson(lesson, selectedDate);

        const subject = escapeHTML(
            lesson.subject || "مادة غير محددة"
        );

        const teacher = escapeHTML(
            lesson.teacher_name || "غير محدد"
        );

        let homeworkStatus = "لا يوجد واجب لهذا اليوم";

        if (state.postsError) {
            homeworkStatus = "تعذر تحميل بيانات الواجب";

        } else if (state.postsLoading && !state.postsLoaded) {
            homeworkStatus = "جارٍ التحقق من الواجبات...";

        } else if (homework) {
            homeworkStatus = "يوجد واجب لهذه المادة";
        }

        return `
        <article class="lesson-card daily-lesson-card">
            <div class="lesson-header">
                <div class="lesson-number">
                    ${formatArabicDigits(index + 1)}
                </div>

                <div class="lesson-info">
                    <h3>${subject}</h3>
                    <p class="lesson-teacher">
                        المعلم: ${teacher}
                    </p>
                </div>
            </div>

            <div class="daily-homework-status ${
                homework ? "has-homework" : "no-homework"
            }">
                <span class="daily-homework-icon">
                    ${homework ? "✦" : "✓"}
                </span>

                <span>${homeworkStatus}</span>

                ${homework ? `
                    <a
                        class="homework-details-link"
                        href="homework-details.html?post_id=${encodeURIComponent(homework.id)}">

                        عرض الواجب
                        <span aria-hidden="true">←</span>
                    </a>
                ` : ""}
            </div>
        </article>
    `;
    }

    /* -------------------- DAILY VIEW -------------------- */

    function updateDayNavigation() {
        const weekDates = getWeekDates();

        document.querySelectorAll(".day-tab").forEach(button => {
            const index = DAYS.findIndex(
                day => day.id === button.dataset.day
            );

            const dateInfo = weekDates[index];
            const active = index === state.currentDayIndex;

            button.classList.toggle("active", active);
            button.setAttribute("aria-selected", String(active));

            const dateElement = button.querySelector("small");

            if (dateElement && dateInfo) {
                const date = parseLocalDate(dateInfo.date);

                dateElement.textContent = date
                    ? formatArabicDigits(date.getDate())
                    : "";
            }
        });

        if (elements.previousDay) {
            elements.previousDay.disabled =
                state.currentDayIndex === 0;
        }

        if (elements.nextDay) {
            elements.nextDay.disabled =
                state.currentDayIndex === DAYS.length - 1;
        }

        if (elements.dayPosition) {
            elements.dayPosition.textContent =
                `اليوم ${formatArabicDigits(state.currentDayIndex + 1)} من ${formatArabicDigits(5)}`;
        }
    }

    function renderDaily() {
        const day = DAYS[state.currentDayIndex];
        const dateInfo = getWeekDates()[state.currentDayIndex];

        if (!day || !dateInfo) return;

        const lessons = getDayLessons(day.id);

        if (elements.currentDayTitle) {
            elements.currentDayTitle.textContent =
                `جدولي يوم ${day.name}`;
        }

        if (elements.currentDate) {
            elements.currentDate.textContent =
                formatDate(dateInfo.date);
        }

        updateDayNavigation();

        if (!lessons.length) {
            showEmpty(
                elements.dayContent,
                "لا توجد حصص لهذا اليوم",
                "لا توجد حصص منشورة لشعبتك في هذا اليوم حالياً."
            );

        } else if (elements.dayContent) {
            elements.dayContent.innerHTML = lessons.map(
                (lesson, index) =>
                    renderLesson(lesson, index, dateInfo.date)
            ).join("");
        }

        const legacyPosts = $("dailyPostsSection");

        if (legacyPosts) {
            legacyPosts.hidden = true;
        }
    }

    /* -------------------- WEEKLY VIEW -------------------- */

    function renderWeekly() {
        if (!elements.weeklyContainer) {
            console.error(
                "Weekly timetable container not found. Check .weekly-table-wrapper in HTML."
            );

            return;
        }

        injectWeeklyStyles();

        const weekDates = getWeekDates();
        const todayString = localDateString(new Date());

        // فرز الحصص مرة واحدة فقط.
        const allLessons = [...state.lessons].sort(compareLessons);

        // تجميع حصص كل يوم مرة واحدة.
        const lessonsByDay = new Map(
            DAYS.map(day => [day.id, []])
        );

        allLessons.forEach(lesson => {
            const dayLessons = lessonsByDay.get(lesson.day_of_week);

            if (dayLessons) {
                dayLessons.push(lesson);
            }
        });

        const periodsMap = new Map();

        allLessons.forEach((lesson, index) => {
            const periodKey = String(
                lesson.period ?? ""
            ).trim();

            if (!periodsMap.has(periodKey)) {
                periodsMap.set(periodKey, {
                    key: periodKey,
                    number: getPeriodNumber(lesson.period),
                    startTime: normalizeTime(lesson.start_time),
                    label: periodKey || `الحصة ${index + 1}`
                });
            }
        });

        const periods = [...periodsMap.values()].sort((a, b) => {
            if (a.number !== b.number) {
                return a.number - b.number;
            }

            return a.startTime.localeCompare(b.startTime);
        });

        // تجهيز فهرس الحصص حسب اليوم ورقم/اسم الحصة.
        const lessonIndex = new Map();

        DAYS.forEach(day => {
            const dayLessons = lessonsByDay.get(day.id) || [];

            dayLessons.forEach(lesson => {
                const number = getPeriodNumber(lesson.period);
                const periodKey = String(
                    lesson.period ?? ""
                ).trim();

                const key = number
                    ? `number:${number}`
                    : `label:${periodKey}`;

                if (!lessonIndex.has(day.id)) {
                    lessonIndex.set(day.id, new Map());
                }

                const dayIndex = lessonIndex.get(day.id);

                if (!dayIndex.has(key)) {
                    dayIndex.set(key, lesson);
                }
            });
        });

        // تحديد وقت كل فترة من جميع أيام الأسبوع.
        // لا يعرض الوقت إذا كان مفقوداً أو مختلفاً بين الأيام.
        function getUniformPeriodTime(periodLookupKey) {
            const matchingLesson = allLessons.find(lesson => {
                const number = getPeriodNumber(lesson.period);
                const periodKey = String(
                    lesson.period ?? ""
                ).trim();

                const key = number
                    ? `number:${number}`
                    : `label:${periodKey}`;

                const start = normalizeTime(lesson.start_time);
                const end = normalizeTime(lesson.end_time);

                return (
                    key === periodLookupKey &&
                    /^\d{2}:\d{2}$/.test(start) &&
                    /^\d{2}:\d{2}$/.test(end)
                );
            });

            if (!matchingLesson) return "";

            return `${formatTime(matchingLesson.start_time)} - ${formatTime(matchingLesson.end_time)}`;
        }

        const headerHTML = `
        <thead>
            <tr>
                <th scope="col">الحصة</th>

                ${weekDates.map(day => {
                    const isToday = day.date === todayString;

                    return `
                        <th
                            scope="col"
                            class="${isToday ? "weekly-today-column" : ""}"
                            aria-current="${isToday ? "date" : "false"}">

                            ${escapeHTML(day.name)}

                            <span class="weekly-day-date">
                                ${escapeHTML(formatDate(day.date, false))}
                            </span>
                        </th>
                    `;
                }).join("")}
            </tr>
        </thead>
    `;

        let bodyHTML = "";

        if (!periods.length) {
            bodyHTML = `
            <tbody>
                <tr>
                    <td colspan="6">
                        <div class="weekly-empty-state">
                            لا توجد حصص منشورة في الجدول الأسبوعي حالياً.
                        </div>
                    </td>
                </tr>
            </tbody>
        `;

        } else {
            bodyHTML = `
            <tbody>
                ${periods.map(period => {
                    const periodLookupKey = period.number
                        ? `number:${period.number}`
                        : `label:${period.key}`;

                    const periodTime =
                        getUniformPeriodTime(periodLookupKey);

                    return `
                        <tr>
                            <th scope="row">
                                <span class="weekly-period-number">
                                    ${escapeHTML(
                                        period.number
                                            ? `الحصة ${formatArabicDigits(period.number)}`
                                            : period.label
                                    )}
                                </span>

                                ${periodTime ? `
                                    <span class="weekly-period-time">
                                        ${escapeHTML(periodTime)}
                                    </span>
                                ` : ""}
                            </th>

                            ${weekDates.map(day => {
                                const isToday =
                                    day.date === todayString;

                                const lesson = lessonIndex
                                    .get(day.id)
                                    ?.get(periodLookupKey);

                                if (!lesson) {
                                    return `
                                        <td class="${isToday ? "weekly-today-column" : ""}">
                                            <span class="weekly-cell-empty">—</span>
                                        </td>
                                    `;
                                }

                                return `
                                    <td class="${isToday ? "weekly-today-column" : ""}">
                                        <div class="weekly-cell-lesson">
                                            <strong class="weekly-cell-subject">
                                                ${escapeHTML(
                                                    lesson.subject || "مادة غير محددة"
                                                )}
                                            </strong>
                                        </div>
                                    </td>
                                `;
                            }).join("")}
                        </tr>
                    `;
                }).join("")}
            </tbody>
        `;
        }

        elements.weeklyContainer.innerHTML = `
        <table class="weekly-classic-table">
            ${headerHTML}
            ${bodyHTML}
        </table>
    `;
    }
        /* -------------------- SCHOOL ANNOUNCEMENTS -------------------- */

    function hideAnnouncementCount() {
        if (!elements.announcementCount) return;

        elements.announcementCount.textContent = "";
        elements.announcementCount.hidden = true;
    }

    async function loadAnnouncements() {
        if (state.announcementsLoaded) {
            renderAnnouncements();
            return;
        }

        if (state.announcementsPromise) {
            await state.announcementsPromise;
            return;
        }

        state.announcementsLoading = true;
        state.announcementsError = "";

        if (elements.announcementsContent) {
            elements.announcementsContent.innerHTML = `
                <div class="loading-state">
                    جارٍ تحميل إعلانات المدرسة...
                </div>
            `;
        }

        state.announcementsPromise = (async () => {
            try {
                const { data, error } = await db.functions.invoke(
                    "school-announcements-handler",
                    {
                        body: {
                            action: "student_announcements"
                        }
                    }
                );

                if (error) throw error;

                if (!data?.success) {
                    throw new Error(
                        data?.error ||
                        data?.message ||
                        "تعذر تحميل إعلانات المدرسة."
                    );
                }

                state.announcements = Array.isArray(data.posts)
                    ? data.posts
                    : [];

                state.announcementsLoaded = true;

            } catch (announcementError) {
                console.error(
                    "STUDENT ANNOUNCEMENTS ERROR:",
                    announcementError
                );

                state.announcements = [];

                state.announcementsError =
                    announcementError?.message ||
                    "تعذر تحميل إعلانات المدرسة.";

            } finally {
                state.announcementsLoading = false;
                state.announcementsPromise = null;

                if (state.announcementsRead) {
                    hideAnnouncementCount();
                }

                renderAnnouncements();
            }
        })();

        await state.announcementsPromise;
    }

    function getPostAttachments(post) {
        const attachments = Array.isArray(post.attachments)
            ? post.attachments
            : [];

        const result = [];

        attachments.forEach(item => {
            const url = safeImageUrl(item.url);

            if (url) {
                result.push({
                    url,
                    name: item.file_name || "مرفق من المدرسة"
                });
            }
        });

        const legacyImage = safeImageUrl(post.image_url);

        if (
            legacyImage &&
            !result.some(item => item.url === legacyImage)
        ) {
            result.push({
                url: legacyImage,
                name: "مرفق من المدرسة"
            });
        }

        return result;
    }

    function renderAnnouncementAttachments(post) {
        const attachments = getPostAttachments(post);

        if (!attachments.length) return "";

        return `
            <div class="homework-attachments">
                ${attachments.map((item, index) => `
                    <button
                        type="button"
                        class="homework-image-button post-image-button"
                        data-image-url="${escapeHTML(item.url)}"
                        data-image-caption="${escapeHTML(item.name)}"
                        aria-label="عرض المرفق ${formatArabicDigits(index + 1)}">

                        <img
                            src="${escapeHTML(item.url)}"
                            alt="${escapeHTML(item.name)}"
                            loading="lazy">

                        <span class="image-open-hint">عرض المرفق</span>
                    </button>
                `).join("")}
            </div>
        `;
    }

    function renderAnnouncement(post) {
        const date = post.target_date
            ? formatDate(post.target_date)
            : formatDate(post.created_at);

        return `
            <article class="post-card">
                <div class="post-card-header">
                    <span class="post-type-icon">✦</span>

                    <div>
                        <strong>إعلان المدرسة</strong>
                        <small>
                            ${escapeHTML(date || "تاريخ النشر غير متاح")}
                        </small>
                    </div>
                </div>

                ${post.content
                    ? `<div class="post-content">${escapeHTML(post.content)}</div>`
                    : ""}

                ${renderAnnouncementAttachments(post)}
            </article>
        `;
    }

    function renderAnnouncements() {
        if (!elements.announcementsContent) return;

        if (state.announcementsLoading) {
            elements.announcementsContent.innerHTML = `
                <div class="loading-state">
                    جارٍ تحميل إعلانات المدرسة...
                </div>
            `;

            return;
        }

        if (state.announcementsError) {
            showError(
                elements.announcementsContent,
                state.announcementsError
            );

            return;
        }

        if (!state.announcementsLoaded) {
            elements.announcementsContent.innerHTML = `
                <div class="loading-state">
                    سيتم تحميل إعلانات المدرسة عند فتح هذا القسم.
                </div>
            `;

            return;
        }

        const announcements = state.announcements;

        if (!announcements.length) {
            showEmpty(
                elements.announcementsContent,
                "لا توجد إعلانات حالياً",
                "ستظهر هنا إعلانات المدرسة عند نشرها."
            );

            return;
        }

        elements.announcementsContent.innerHTML =
            announcements.map(renderAnnouncement).join("");
    }

    /* =========================================================
       STUDENT CHAT
       All chat operations go through teacher-chat-handler.
       No direct database access to chat tables.
       ========================================================= */

    function setChatFormMessage(message, isError = true) {
        if (!elements.chatFormMessage) return;

        elements.chatFormMessage.textContent = message || "";

        elements.chatFormMessage.style.color = isError
            ? "#a12b38"
            : "#28734c";
    }

    function getChatRoomId(room) {
        return room?.id ?? room?.room_id ?? null;
    }

    function isChatRoomOpen(room) {
        return String(room?.status || "").toLowerCase() === "open";
    }

    function formatChatDate(value) {
        if (!value) return "غير محدد";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return "غير محدد";
        }

        return new Intl.DateTimeFormat("ar-IQ", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        }).format(date);
    }

    function getRoomTeacherName(room) {
        return room?.teacher_name ||
            room?.teacher_full_name ||
            room?.full_name ||
            "المعلم";
    }

    function getRoomSubject(room) {
        return room?.subject || "غرفة أسئلة";
    }

    async function callStudentChatHandler(action, payload = {}) {
        if (!db?.functions) {
            throw new Error("اتصال خدمات النظام غير متاح.");
        }

        const { data, error } = await db.functions.invoke(
            CHAT_FUNCTION,
            {
                body: {
                    action,
                    ...payload
                }
            }
        );

        if (error) {
            let message =
                error.message ||
                "تعذر الاتصال بخدمة غرف الأسئلة.";

            if (typeof error.context?.json === "function") {
                try {
                    const body = await error.context.json();

                    message =
                        body?.message ||
                        body?.error ||
                        message;

                } catch {
                    // الاحتفاظ برسالة الخطأ الأصلية
                }
            }

            throw new Error(message);
        }

        if (!data || data.success !== true) {
            throw new Error(
                data?.message ||
                data?.error ||
                "لم تنجح العملية المطلوبة."
            );
        }

        return data;
    }

    function renderStudentChatRooms() {
        if (!elements.chatRoomsList) return;

        if (!state.chatRooms.length) {
            showEmpty(
                elements.chatRoomsList,
                "لا توجد غرف أسئلة",
                "لم يفتح معلموك غرف أسئلة لشعبتك حتى الآن."
            );

            return;
        }

        elements.chatRoomsList.innerHTML = state.chatRooms.map(room => {
            const roomId = getChatRoomId(room);
            const isOpen = isChatRoomOpen(room);

            const selected = String(
                getChatRoomId(state.selectedChatRoom)
            ) === String(roomId);

            return `
                <button
                    type="button"
                    class="student-chat-room-item ${selected ? "active" : ""}"
                    data-student-chat-room="${escapeHTML(roomId)}">

                    <span class="student-chat-room-subject">
                        ${escapeHTML(getRoomSubject(room))}
                    </span>

                    <span class="student-chat-room-teacher">
                        ${escapeHTML(getRoomTeacherName(room))}
                    </span>

                    <span class="student-chat-room-date">
                        وقت الفتح:
                        ${escapeHTML(formatChatDate(room.opened_at))}
                    </span>

                    <span class="student-chat-room-badge ${isOpen ? "open" : "closed"}">
                        ${isOpen
                            ? "مفتوحة لاستقبال الأسئلة"
                            : "مغلقة · قراءة فقط"}
                    </span>
                </button>
            `;
        }).join("");
    }

    function renderStudentChatMessages() {
        if (!elements.chatMessages) return;

        if (!state.selectedChatRoom) {
            elements.chatMessages.innerHTML = `
                <div class="student-chat-placeholder">
                    <span>✉</span>
                    <strong>محادثاتك الدراسية</strong>
                    <p>اختر غرفة من القائمة لعرض رسائلك مع المعلم.</p>
                </div>
            `;

            return;
        }

        if (!state.chatMessages.length) {
            showEmpty(
                elements.chatMessages,
                "لا توجد رسائل بعد",
                "يمكنك كتابة سؤالك للمعلم في الأسفل."
            );

            return;
        }

        elements.chatMessages.innerHTML = state.chatMessages.map(message => {
            const senderRole = String(
                message.sender_role || ""
            ).toLowerCase();

            const isTeacher = senderRole === "teacher";

            const senderName = message.sender_name ||
                (isTeacher ? "المعلم" : "الطالب");

            return `
                <article class="student-chat-message ${isTeacher ? "teacher" : "student"}">
                    <div class="student-chat-message-head">
                        <strong>${escapeHTML(senderName)}</strong>
                        <time>
                            ${escapeHTML(formatChatDate(message.created_at))}
                        </time>
                    </div>

                    <div class="student-chat-message-body">${escapeHTML(message.message || "")}</div>
                </article>
            `;
        }).join("");

        elements.chatMessages.scrollTop =
            elements.chatMessages.scrollHeight;
    }

    function updateStudentChatComposer() {
        const selected = state.selectedChatRoom;

        const canSend = Boolean(
            selected && isChatRoomOpen(selected)
        );

        if (elements.chatMessageInput) {
            elements.chatMessageInput.disabled =
                !canSend || state.chatSending;

            elements.chatMessageInput.placeholder = canSend
                ? "اكتب سؤالك للمعلم..."
                : "هذه الغرفة مغلقة، يمكنك قراءة المحادثة فقط.";
        }

        if (elements.chatSendButton) {
            elements.chatSendButton.disabled =
                !canSend || state.chatSending;

            elements.chatSendButton.textContent =
                state.chatSending
                    ? "جارٍ الإرسال..."
                    : "إرسال السؤال";
        }

        if (elements.chatRoomStatus) {
            if (!selected) {
                elements.chatRoomStatus.textContent = "غير محددة";
                elements.chatRoomStatus.className =
                    "student-chat-status";

            } else if (canSend) {
                elements.chatRoomStatus.textContent = "مفتوحة";
                elements.chatRoomStatus.className =
                    "student-chat-status open";

            } else {
                elements.chatRoomStatus.textContent = "مغلقة";
                elements.chatRoomStatus.className =
                    "student-chat-status closed";
            }
        }
    }

    function renderSelectedStudentChatRoom() {
        const room = state.selectedChatRoom;

        if (!room) {
            if (elements.chatRoomTitle) {
                elements.chatRoomTitle.textContent =
                    "اختر غرفة أسئلة";
            }

            if (elements.chatRoomMeta) {
                elements.chatRoomMeta.textContent =
                    "اختر إحدى الغرف لعرض المحادثة";
            }

            updateStudentChatComposer();
            renderStudentChatMessages();

            return;
        }

        if (elements.chatRoomTitle) {
            elements.chatRoomTitle.textContent =
                getRoomSubject(room);
        }

        if (elements.chatRoomMeta) {
            elements.chatRoomMeta.textContent =
                `${getRoomTeacherName(room)} · وقت الفتح: ${formatChatDate(room.opened_at)}`;
        }

        updateStudentChatComposer();
        renderStudentChatMessages();
    }

    async function loadStudentChatRooms(options = {}) {
        if (!elements.chatRoomsList) return;

        if (state.chatRoomsPromise) {
            return state.chatRoomsPromise;
        }

        if (state.chatRoomsLoaded && options.force !== true) {
            renderStudentChatRooms();
            renderSelectedStudentChatRoom();
            return;
        }

        state.chatLoading = true;

        if (elements.chatRefreshButton) {
            elements.chatRefreshButton.disabled = true;
        }

        if (
            options.showLoading !== false &&
            !state.chatRoomsLoaded
        ) {
            elements.chatRoomsList.innerHTML =
                `<div class="loading-state">جارٍ تحميل غرف الأسئلة...</div>`;
        }

        state.chatRoomsPromise = (async () => {
            try {
                const data = await callStudentChatHandler(
                    "student_list_rooms"
                );

                state.chatRooms = Array.isArray(data.rooms)
                    ? data.rooms
                    : [];

                state.chatRoomsLoaded = true;

                const openCount = state.chatRooms.filter(
                    isChatRoomOpen
                ).length;

                if (elements.chatOpenCount) {
                    elements.chatOpenCount.textContent =
                        formatArabicDigits(openCount);

                    elements.chatOpenCount.hidden =
                        openCount === 0;
                }

                if (state.selectedChatRoom) {
                    const selectedId = String(
                        getChatRoomId(state.selectedChatRoom)
                    );

                    const updatedRoom = state.chatRooms.find(room =>
                        String(getChatRoomId(room)) === selectedId
                    );

                    if (updatedRoom) {
                        state.selectedChatRoom = updatedRoom;
                    } else {
                        state.selectedChatRoom = null;
                        state.chatMessages = [];
                    }
                }

                renderStudentChatRooms();
                renderSelectedStudentChatRoom();

            } catch (error) {
                console.error(
                    "STUDENT CHAT ROOMS ERROR:",
                    error
                );

                const hasPreviousRooms =
                    state.chatRooms.length > 0;

                state.chatRoomsLoaded = false;

                if (!hasPreviousRooms) {
                    showError(elements.chatRoomsList, error.message);
                } else {
                    renderStudentChatRooms();
                }

                setChatFormMessage(
                    error.message || "تعذر تحديث غرف الأسئلة."
                );

            } finally {
                state.chatLoading = false;
                state.chatRoomsPromise = null;

                if (elements.chatRefreshButton) {
                    elements.chatRefreshButton.disabled = false;
                }
            }
        })();

        return state.chatRoomsPromise;
    }
        async function selectStudentChatRoom(roomId) {
        const room = state.chatRooms.find(item =>
            String(getChatRoomId(item)) === String(roomId)
        );

        if (!room) return;

        state.selectedChatRoom = room;
        state.chatMessages = [];

        renderStudentChatRooms();
        renderSelectedStudentChatRoom();

        if (elements.chatMessages) {
            elements.chatMessages.innerHTML =
                `<div class="loading-state">جارٍ تحميل المحادثة...</div>`;
        }

        setChatFormMessage("");

        try {
            const data = await callStudentChatHandler(
                "get_room_messages",
                {
                    room_id: roomId
                }
            );

            // لا نعرض بيانات غرفة أخرى إذا اختار الطالب غرفة مختلفة أثناء التحميل.
            if (
                String(getChatRoomId(state.selectedChatRoom)) !==
                String(roomId)
            ) {
                return;
            }

            if (data.room) {
                state.selectedChatRoom = data.room;
            }

            state.chatMessages = Array.isArray(data.messages)
                ? data.messages
                : [];

            renderStudentChatRooms();
            renderSelectedStudentChatRoom();

        } catch (error) {
            console.error(
                "STUDENT CHAT MESSAGES ERROR:",
                error
            );

            if (
                String(getChatRoomId(state.selectedChatRoom)) ===
                String(roomId)
            ) {
                showError(elements.chatMessages, error.message);
            }
        }
    }

    async function sendStudentChatMessage(event) {
        event.preventDefault();

        const room = state.selectedChatRoom;

        if (!room || !isChatRoomOpen(room)) {
            setChatFormMessage(
                "لا يمكن إرسال رسالة؛ هذه الغرفة مغلقة."
            );

            updateStudentChatComposer();

            return;
        }

        const message = String(
            elements.chatMessageInput?.value || ""
        ).trim();

        if (!message) {
            setChatFormMessage("اكتب سؤالك أولاً.");
            return;
        }

        if (state.chatSending) return;

        state.chatSending = true;

        setChatFormMessage("");
        updateStudentChatComposer();

        try {
            await callStudentChatHandler(
                "send_message",
                {
                    room_id: getChatRoomId(room),
                    message
                }
            );

            if (elements.chatMessageInput) {
                elements.chatMessageInput.value = "";
            }

            const data = await callStudentChatHandler(
                "get_room_messages",
                {
                    room_id: getChatRoomId(room)
                }
            );

            if (
                String(getChatRoomId(state.selectedChatRoom)) !==
                String(getChatRoomId(room))
            ) {
                return;
            }

            if (data.room) {
                state.selectedChatRoom = data.room;
            }

            state.chatMessages = Array.isArray(data.messages)
                ? data.messages
                : [];

            renderSelectedStudentChatRoom();
            renderStudentChatMessages();
            renderStudentChatRooms();

            setChatFormMessage(
                "تم إرسال سؤالك بنجاح.",
                false
            );

        } catch (error) {
            console.error(
                "STUDENT CHAT SEND ERROR:",
                error
            );

            setChatFormMessage(
                error.message || "تعذر إرسال السؤال."
            );

        } finally {
            state.chatSending = false;
            updateStudentChatComposer();
        }
    }

    /*
     * تفعيل تنسيقات غرفة الأسئلة عند فتح التبويب فقط.
     * قواعد التنسيق الفعلية موجودة في css/timetable.css.
     */
    function injectStudentChatStyles() {
        const chatView = $("chatView");

        if (!chatView) return;

        chatView.classList.add("student-chat-ready");
    }

    function bindStudentChatEvents() {
        // لا يتم تفعيل تنسيقات المحادثات هنا؛ تؤجل حتى فتح التبويب.

        elements.chatRoomsList?.addEventListener("click", event => {
            const button = event.target.closest(
                "[data-student-chat-room]"
            );

            if (!button) return;

            selectStudentChatRoom(
                button.dataset.studentChatRoom
            );
        });

        elements.chatRefreshButton?.addEventListener(
            "click",
            () => {
                loadStudentChatRooms({ force: true });
            }
        );

        elements.chatMessageForm?.addEventListener(
            "submit",
            sendStudentChatMessage
        );
    }

    /* -------------------- NAVIGATION -------------------- */

    function switchView(viewName) {
        const views = {
            account: $("accountView"),
            daily: $("dailyView"),
            weekly: $("weeklyView"),
            chat: $("chatView"),
            announcements: $("announcementsView")
        };

        if (!views[viewName]) return;

        state.currentView = viewName;

        Object.entries(views).forEach(([name, panel]) => {
            if (panel) {
                panel.hidden = name !== viewName;
            }
        });

        document.querySelectorAll(".student-tab").forEach(button => {
            const active = button.dataset.view === viewName;

            button.classList.toggle("active", active);

            button.setAttribute(
                "aria-selected",
                String(active)
            );
        });

        if (viewName === "daily") {
            renderDaily();
        }

        if (viewName === "weekly") {
            renderWeekly();
        }

        if (viewName === "announcements") {
            state.announcementsRead = true;
            hideAnnouncementCount();
            loadAnnouncements();
        }

        if (viewName === "account") {
            renderAccount();
        }

        if (viewName === "chat") {
            injectStudentChatStyles();
            loadStudentChatRooms();
        }
    }

    /* -------------------- IMAGE VIEWER -------------------- */

    function openImageViewer(url, caption) {
        const safeUrl = safeImageUrl(url);

        if (!safeUrl || !elements.imageViewer) return;

        if (elements.viewerImage) {
            elements.viewerImage.src = safeUrl;
        }

        if (elements.viewerCaption) {
            elements.viewerCaption.textContent =
                caption || "مرفق من المدرسة";
        }

        if (!elements.imageViewer.open) {
            elements.imageViewer.showModal();
        }
    }

    function closeImageViewer() {
        if (elements.imageViewer?.open) {
            elements.imageViewer.close();
        }
    }

    /* -------------------- LOGOUT -------------------- */

    function closeLogoutDialog() {
        if (elements.logoutDialog?.open) {
            elements.logoutDialog.close();
        }

        if (elements.logoutDialogError) {
            elements.logoutDialogError.hidden = true;
            elements.logoutDialogError.textContent = "";
        }
    }

    function openLogoutDialog() {
        if (!elements.logoutDialog) return;

        if (elements.logoutDialogMessage) {
            elements.logoutDialogMessage.textContent =
                "هل أنت متأكد أنك تريد تسجيل الخروج من حسابك؟";
        }

        if (elements.logoutDialogError) {
            elements.logoutDialogError.hidden = true;
            elements.logoutDialogError.textContent = "";
        }

        if (elements.confirmLogoutButton) {
            elements.confirmLogoutButton.disabled = false;
            elements.confirmLogoutButton.textContent = "تسجيل الخروج";
        }

        if (elements.cancelLogoutButton) {
            elements.cancelLogoutButton.disabled = false;
        }

        elements.logoutDialog.showModal();
    }

    async function confirmStudentLogout() {
        if (!elements.confirmLogoutButton) return;

        elements.confirmLogoutButton.disabled = true;
        elements.confirmLogoutButton.textContent =
            "جارٍ تسجيل الخروج...";

        if (elements.cancelLogoutButton) {
            elements.cancelLogoutButton.disabled = true;
        }

        if (elements.logoutDialogError) {
            elements.logoutDialogError.hidden = true;
            elements.logoutDialogError.textContent = "";
        }

        try {
            const { error } = await db.auth.signOut();

            if (error) throw error;

            window.location.replace("index.html");

        } catch (error) {
            console.error("Logout error:", error);

            if (elements.logoutDialogError) {
                elements.logoutDialogError.textContent =
                    "تعذر تسجيل الخروج. تحقق من الاتصال ثم حاول مرة أخرى.";

                elements.logoutDialogError.hidden = false;
            }

            elements.confirmLogoutButton.disabled = false;
            elements.confirmLogoutButton.textContent = "إعادة المحاولة";

            if (elements.cancelLogoutButton) {
                elements.cancelLogoutButton.disabled = false;
            }
        }
    }

    function bindLogout() {
        if (!elements.logoutButton) return;

        elements.logoutButton.addEventListener("click", openLogoutDialog);

        elements.cancelLogoutButton?.addEventListener(
            "click",
            closeLogoutDialog
        );

        elements.confirmLogoutButton?.addEventListener(
            "click",
            confirmStudentLogout
        );

        elements.logoutDialog?.addEventListener("click", event => {
            if (event.target === elements.logoutDialog) {
                closeLogoutDialog();
            }
        });

        elements.logoutDialog?.addEventListener("cancel", event => {
            event.preventDefault();
            closeLogoutDialog();
        });
    }

    /* -------------------- EVENTS -------------------- */

    function bindEvents() {
        document.querySelectorAll(".student-tab").forEach(button => {
            button.addEventListener("click", () => {
                switchView(button.dataset.view);
            });
        });

        document.querySelectorAll(".day-tab").forEach(button => {
            button.addEventListener("click", () => {
                const index = DAYS.findIndex(
                    day => day.id === button.dataset.day
                );

                if (index < 0) return;

                state.currentDayIndex = index;
                renderDaily();
            });
        });

        elements.previousDay?.addEventListener("click", () => {
            if (state.currentDayIndex > 0) {
                state.currentDayIndex--;
                renderDaily();
            }
        });

        elements.nextDay?.addEventListener("click", () => {
            if (state.currentDayIndex < DAYS.length - 1) {
                state.currentDayIndex++;
                renderDaily();
            }
        });

        document.addEventListener("click", event => {
            const imageButton = event.target.closest(
                "[data-image-url]"
            );

            if (imageButton) {
                openImageViewer(
                    imageButton.dataset.imageUrl,
                    imageButton.dataset.imageCaption
                );
            }
        });

        $("closeImageViewer")?.addEventListener(
            "click",
            closeImageViewer
        );

        elements.imageViewer?.addEventListener("click", event => {
            if (event.target === elements.imageViewer) {
                closeImageViewer();
            }
        });

        elements.imageViewer?.addEventListener("close", () => {
            elements.viewerImage?.removeAttribute("src");

            if (elements.viewerCaption) {
                elements.viewerCaption.textContent = "";
            }
        });

        bindStudentChatEvents();
        bindLogout();
    }

    /* -------------------- INITIALIZATION -------------------- */

    async function initialize() {
        const yearElement = $("currentYear");

        if (yearElement) {
            yearElement.textContent =
                new Date().getFullYear();
        }

        hideAnnouncementCount();

        if (!db?.auth || !db?.from || !db?.functions) {
            showError(
                elements.dayContent,
                "تعذر الاتصال بقاعدة البيانات. تحقق من إعدادات Supabase."
            );

            return;
        }

        const today = new Date().getDay();

        state.currentDayIndex =
            today >= 0 && today <= 4 ? today : 0;

        bindEvents();

        try {
            const loaded = await loadStudentData();

            if (!loaded) return;

            await loadTimetable();

            // تجهيز اسم الطالب والمدرسة دون إنشاء محتوى صفحة الحساب.
            renderWelcome();

            // عرض التبويب اليومي فقط عند بدء الصفحة.
            // الحساب والأسبوع والمحادثات والإعلانات تؤجل حتى فتحها.
            switchView("daily");

            // تحميل الواجبات في الخلفية دون تعطيل ظهور الجدول.
            loadPosts();

        } catch (error) {
            console.error(
                "Student portal initialization error:",
                error
            );

            const message =
                error?.message ||
                "حدث خطأ أثناء تحميل بيانات الطالب.";

            showError(elements.dayContent, message);
            showError(elements.accountContent, message);
            showWeeklyError(message);
        }
    }

    function showWeeklyError(message) {
        if (elements.weeklyContainer) {
            elements.weeklyContainer.innerHTML = `
                <div class="weekly-empty-state error-state">
                    ${escapeHTML(message)}
                </div>
            `;
        }
    }

    initialize();
})();