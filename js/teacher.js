
"use strict";

/* =========================================================
   ILABRAT TEACHER PORTAL
   Supabase + homework-handler
   Teacher-specific authentication session
   School announcements: school-announcements-handler
   Teacher chat: teacher-chat-handler
   ========================================================= */

const HOMEWORK_FUNCTION = "homework-handler";
const ANNOUNCEMENTS_FUNCTION = "school-announcements-handler";
const TEACHER_CHAT_FUNCTION = "teacher-chat-handler";

const TEACHER_DAYS = [
    { id: "sun", name: "الأحد", values: ["sun", "sunday", "الأحد", "الاحد", "0"] },
    { id: "mon", name: "الاثنين", values: ["mon", "monday", "الاثنين", "الإثنين", "1"] },
    { id: "tue", name: "الثلاثاء", values: ["tue", "tuesday", "الثلاثاء", "2"] },
    { id: "wed", name: "الأربعاء", values: ["wed", "wednesday", "الأربعاء", "الاربعاء", "3"] },
    { id: "thu", name: "الخميس", values: ["thu", "thursday", "الخميس", "4"] }
];

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp"
];

const state = {
    supabase: null,
    user: null,
    profile: null,
    school: null,

    schedule: [],
    assignments: [],
    homeworkPosts: [],

    // إعلانات المدرسة منفصلة عن واجبات المعلم.
    announcements: [],
    announcementsError: "",

    // منع إرسال طلب مشاهدة مكرر للإعلان نفسه.
    pendingAnnouncementReads: new Set(),

    // غرف أسئلة الطلاب.
    teacherChatRooms: [],
    selectedTeacherChatRoom: null,
    teacherChatMessages: [],
    isLoadingTeacherChat: false,
    isOpeningTeacherChat: false,
    isClosingTeacherChat: false,
    isSendingTeacherChatMessage: false,

    selectedDay: getTodayDayId(),

    selectedFiles: [],
    modalSelectedFiles: [],
    removeAttachmentIds: new Set(),

    editingPost: null,
    isSaving: false,
    isDeleting: false
};

const $ = (id) => document.getElementById(id);

/* =========================================================
   ELEMENTS
   ========================================================= */

const selectedFilesElements =
    document.querySelectorAll("#selectedFiles");

const elements = {
    sidebar: $("teacherSidebar"),
    backdrop: $("sidebarBackdrop"),
    mobileMenuButton: $("mobileMenuButton"),

    pageHeading: $("pageHeading"),
    pageMessage: $("pageMessage"),

    teacherDisplayName: $("teacherDisplayName"),
    teacherAvatar: $("teacherAvatar"),
    schoolDisplayName: $("schoolDisplayName"),
    currentDate: $("currentDate"),

    todayLessonCount: $("todayLessonCount"),
    assignmentCount: $("assignmentCount"),
    attachmentCount: $("attachmentCount"),

    // عدد إعلانات المدرسة غير المشاهدة.
    unreadAnnouncementCount: $("unreadAnnouncementCount"),

    dayTabs: [...document.querySelectorAll(".day-tab")],
    selectedDayTitle: $("selectedDayTitle"),
    selectedDayDescription: $("selectedDayDescription"),
    lessonCounter: $("lessonCounter"),
    lessonList: $("lessonList"),

    refreshScheduleButton: $("refreshScheduleButton"),

    weeklyScheduleList: $("weeklyScheduleList"),
    refreshWeeklyScheduleButton: $("refreshWeeklyScheduleButton"),

    homeworkForm: $("homeworkForm"),
    homeworkClass: $("homeworkClass"),
    homeworkSubject: $("homeworkSubject"),
    homeworkTargetDate: $("homeworkTargetDate"),
    homeworkContent: $("homeworkContent"),
    homeworkFiles: $("homeworkFiles"),

    selectedFilesList: selectedFilesElements[0] || null,
    homeworkFormMessage: $("homeworkFormMessage"),
    publishHomeworkButton: $("publishHomeworkButton"),
    resetHomeworkButton: $("resetHomeworkButton"),
    teacherHomeworkList: $("teacherHomeworkList"),
    refreshHomeworkButton: $("refreshHomeworkButton"),

    assignedClassCount: $("assignedClassCount"),
    assignedSubjectCount: $("assignedSubjectCount"),
    teacherAssignmentsList: $("teacherAssignmentsList"),
    refreshAssignmentsButton: $("refreshAssignmentsButton"),

    announcementsList: $("teacherAnnouncementsList"),
    announcementBadge: $("announcementBadge"),
    refreshAnnouncementsButton: $("refreshAnnouncementsButton"),

    // غرف أسئلة الطلاب.
    teacherChatBadge: $("teacherChatBadge"),
    teacherChatClass: $("teacherChatClass"),
    teacherChatSubject: $("teacherChatSubject"),
    openTeacherChatRoomButton: $("openTeacherChatRoomButton"),
    refreshTeacherChatButton: $("refreshTeacherChatButton"),
    teacherChatActionMessage: $("teacherChatActionMessage"),
    teacherChatRoomsList: $("teacherChatRoomsList"),
    teacherChatConversationPanel: $("teacherChatConversationPanel"),
    teacherChatRoomTitle: $("teacherChatRoomTitle"),
    teacherChatRoomStatus: $("teacherChatRoomStatus"),
    closeTeacherChatRoomButton: $("closeTeacherChatRoomButton"),
    teacherChatMessages: $("teacherChatMessages"),
    teacherChatMessageForm: $("teacherChatMessageForm"),
    teacherChatMessageInput: $("teacherChatMessageInput"),
    sendTeacherChatMessageButton: $("sendTeacherChatMessageButton"),
    teacherChatMessageStatus: $("teacherChatMessageStatus"),

    profileAvatar: $("profileAvatar"),
    profileFullName: $("profileFullName"),
    profileNameValue: $("profileNameValue"),
    profileLoginName: $("profileLoginName"),
    profilePhone: $("profilePhone"),
    profileSchool: $("profileSchool"),

    logoutButton: $("logoutButton"),

    assignmentModal: $("assignmentModal"),
    assignmentForm: $("assignmentForm"),
    modalTitle: $("modalTitle"),
    modalLessonInfo: $("modalLessonInfo"),
    postId: $("postId"),
    assignmentClass: $("assignmentClass"),
    assignmentSubject: $("assignmentSubject"),
    assignmentTargetDate: $("assignmentTargetDate"),
    assignmentDescription: $("assignmentDescription"),
    attachmentFiles: $("attachmentFiles"),

    modalSelectedFiles:
        $("modalSelectedFiles") || selectedFilesElements[1] || null,

    existingAttachments: $("existingAttachments"),
    formMessage: $("formMessage"),
    saveAssignmentButton: $("saveAssignmentButton"),
    closeModalButton: $("closeModalButton"),
    cancelModalButton: $("cancelModalButton"),

    imageModal: $("imageModal"),
    previewImage: $("previewImage"),
    previewImageName: $("previewImageName"),
    closeImageButton: $("closeImageButton")
};

/* =========================================================
   GENERAL HELPERS
   ========================================================= */

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

/*
 * مهم:
 * لا تستخدم window.supabaseClient العام هنا.
 * يجب أن تكون جلسة المعلم مستقلة عن جلسة مدير المدرسة
 * والطالب ومدير التطبيق.
 *
 * يتطلب هذا أن يعرّف supabase-config.js:
 * window.supabaseClients.teacher
 */

function getSupabaseClient() {
    const client = window.supabaseClients?.teacher;

    if (!client) {
        console.error(
            "[ILABRAT] Teacher Supabase client not found.",
            "Expected window.supabaseClients.teacher.",
            "تأكد من تحميل supabase-config.js وإعداد جلسة المعلم."
        );

        return null;
    }

    return client;
}

function getTodayDayId() {
    const day = new Date().getDay();

    const match = TEACHER_DAYS.find(item =>
        item.values.includes(String(day))
    );

    return match ? match.id : "sun";
}

function normalizeDay(value) {
    const normalized = String(value ?? "").trim().toLowerCase();

    return TEACHER_DAYS.find(day =>
        day.values.some(item =>
            String(item).toLowerCase() === normalized
        )
    )?.id || null;
}

function getDayName(dayId) {
    return TEACHER_DAYS.find(day => day.id === dayId)?.name ||
        "غير محدد";
}

function formatCurrentDate() {
    return new Intl.DateTimeFormat("ar-IQ", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
    }).format(new Date());
}

function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return new Intl.DateTimeFormat("ar-IQ", {
        year: "numeric",
        month: "long",
        day: "numeric"
    }).format(date);
}

function formatDateTime(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return new Intl.DateTimeFormat("ar-IQ", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
    }).format(date);
}

function formatTime(value) {
    if (!value) return "—";

    const match = String(value).match(/^(\d{1,2}):(\d{2})/);

    if (!match) return value;

    const hours = Number(match[1]);
    const minutes = match[2];
    const suffix = hours >= 12 ? "م" : "ص";
    const displayHour = hours % 12 || 12;

    return `${displayHour}:${minutes} ${suffix}`;
}

function classLabel(classInfo) {
    if (!classInfo) return "الشعبة";

    const parts = [
        classInfo.stage,
        classInfo.grade_name || classInfo.name,
        classInfo.gender,
        classInfo.section_name
            ? `شعبة ${classInfo.section_name}`
            : ""
    ].filter(Boolean);

    return parts.join(" — ") || classInfo.name || "الشعبة";
}

function showPageMessage(message, type = "info") {
    if (!elements.pageMessage) return;

    elements.pageMessage.textContent = message;
    elements.pageMessage.className = `page-message ${type}`;
    elements.pageMessage.hidden = !message;
}

function showHomeworkMessage(message, type = "error") {
    if (!elements.homeworkFormMessage) return;

    elements.homeworkFormMessage.textContent = message;
    elements.homeworkFormMessage.className =
        `form-message ${type === "success" ? "success" : ""}`;

    elements.homeworkFormMessage.hidden = !message;
}

function showModalMessage(message, type = "error") {
    if (!elements.formMessage) return;

    elements.formMessage.textContent = message;
    elements.formMessage.className =
        `form-message ${type === "success" ? "success" : ""}`;

    elements.formMessage.hidden = !message;
}

function setText(id, value) {
    const element = $(id);

    if (element) {
        element.textContent = value ?? "—";
    }
}

function setLoading(container, message = "جارٍ التحميل...") {
    if (!container) return;

    container.innerHTML = `
        <div class="loading-state">
            <span class="loading-spinner"></span>
            <p>${escapeHTML(message)}</p>
        </div>
    `;
}

function showEmpty(container, title, description) {
    if (!container) return;

    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">▦</div>
            <h3>${escapeHTML(title)}</h3>
            <p>${escapeHTML(description)}</p>
        </div>
    `;
}

function getErrorMessage(error, fallback = "حدث خطأ غير متوقع.") {
    const message = String(error?.message || "");

    if (
        message.includes("JWT") ||
        message.toLowerCase().includes("token") ||
        message.includes("401")
    ) {
        return "انتهت جلسة الدخول. يرجى تسجيل الدخول مجددًا.";
    }

    if (
        message.includes("Failed to fetch") ||
        message.includes("NetworkError")
    ) {
        return "تعذر الاتصال بالخادم. تحقق من الإنترنت وحاول مرة أخرى.";
    }

    return message || fallback;
}

/* =========================================================
   EDGE FUNCTION ERROR READER
   ========================================================= */

async function readFunctionError(error) {
    const context = error?.context;

    if (!context) {
        return error?.message || "";
    }

    try {
        if (context instanceof Response) {
            const cloned = context.clone();
            const text = await cloned.text();

            if (!text) {
                return error?.message || "";
            }

            try {
                const body = JSON.parse(text);

                return body?.message ||
                    body?.error ||
                    body?.msg ||
                    text;
            } catch {
                return text;
            }
        }

        if (typeof context === "object") {
            return context.message ||
                context.error ||
                JSON.stringify(context);
        }
    } catch (readError) {
        console.warn(
            "تعذر قراءة تفاصيل استجابة الخادم:",
            readError
        );
    }

    return error?.message || "";
}

/* =========================================================
   EDGE FUNCTION REQUEST — HOMEWORK
   ========================================================= */

async function callHomeworkHandler(action, payload = {}) {
    if (!state.supabase) {
        throw new Error("اتصال قاعدة البيانات غير متاح.");
    }

    const { data, error } = await state.supabase.functions.invoke(
        HOMEWORK_FUNCTION,
        {
            body: {
                action,
                ...payload
            }
        }
    );

    if (error) {
        const serverMessage = await readFunctionError(error);

        console.error("HOMEWORK HANDLER ERROR:", {
            action,
            status: error?.context?.status,
            serverMessage,
            error
        });

        throw new Error(
            serverMessage ||
            getErrorMessage(error, "تعذر الاتصال بخدمة الواجبات.")
        );
    }

    if (!data || data.success !== true) {
        console.error("HOMEWORK HANDLER INVALID RESPONSE:", {
            action,
            data
        });

        throw new Error(
            data?.message || "لم تنجح العملية المطلوبة."
        );
    }

    return data;
}

async function callHomeworkHandlerWithFiles(
    action,
    payload = {},
    files = []
) {
    if (!state.supabase) {
        throw new Error("اتصال قاعدة البيانات غير متاح.");
    }

    const formData = new FormData();

    formData.append("action", action);

    Object.entries(payload).forEach(([key, value]) => {
        if (value === undefined || value === null) return;

        formData.append(
            key,
            typeof value === "string"
                ? value
                : JSON.stringify(value)
        );
    });

    files.forEach(file => {
        formData.append("files", file, file.name);
    });

    const { data, error } = await state.supabase.functions.invoke(
        HOMEWORK_FUNCTION,
        {
            body: formData
        }
    );

    if (error) {
        const serverMessage = await readFunctionError(error);

        console.error("HOMEWORK FILE REQUEST ERROR:", {
            action,
            status: error?.context?.status,
            serverMessage,
            error
        });

        throw new Error(
            serverMessage ||
            getErrorMessage(error, "تعذر رفع مرفقات الواجب.")
        );
    }

    if (!data || data.success !== true) {
        throw new Error(
            data?.message || "لم تنجح العملية المطلوبة."
        );
    }

    return data;
}

/* =========================================================
   EDGE FUNCTION REQUEST — SCHOOL ANNOUNCEMENTS
   ========================================================= */

async function callAnnouncementsHandler(action, payload = {}) {
    if (!state.supabase) {
        throw new Error("اتصال قاعدة البيانات غير متاح.");
    }

    const { data, error } = await state.supabase.functions.invoke(
        ANNOUNCEMENTS_FUNCTION,
        {
            body: {
                action,
                ...payload
            }
        }
    );

    if (error) {
        const serverMessage = await readFunctionError(error);

        console.error("SCHOOL ANNOUNCEMENTS HANDLER ERROR:", {
            action,
            status: error?.context?.status,
            serverMessage,
            error
        });

        throw new Error(
            serverMessage ||
            getErrorMessage(error, "تعذر الاتصال بخدمة إعلانات المدرسة.")
        );
    }

    if (!data || data.success !== true) {
        console.error("SCHOOL ANNOUNCEMENTS INVALID RESPONSE:", {
            action,
            data
        });

        throw new Error(
            data?.error ||
            data?.message ||
            "لم تنجح عملية إعلانات المدرسة."
        );
    }

    return data;
}

/* =========================================================
   EDGE FUNCTION REQUEST — TEACHER CHAT
   ========================================================= */

async function callTeacherChatHandler(action, payload = {}) {
    if (!state.supabase) {
        throw new Error("اتصال قاعدة البيانات غير متاح.");
    }

    const { data, error } = await state.supabase.functions.invoke(
        TEACHER_CHAT_FUNCTION,
        {
            body: {
                action,
                ...payload
            }
        }
    );

    if (error) {
        const serverMessage = await readFunctionError(error);

        console.error("TEACHER CHAT HANDLER ERROR:", {
            action,
            status: error?.context?.status,
            serverMessage,
            error
        });

        throw new Error(
            serverMessage ||
            getErrorMessage(error, "تعذر الاتصال بخدمة غرف الأسئلة.")
        );
    }

    if (!data || data.success !== true) {
        console.error("TEACHER CHAT INVALID RESPONSE:", {
            action,
            data
        });

        throw new Error(
            data?.message || "لم تنجح عملية غرف الأسئلة."
        );
    }

    return data;
}

/* =========================================================
   AUTHENTICATION AND PROFILE
   ========================================================= */

async function verifyTeacherSession() {
    const { data, error } = await state.supabase.auth.getUser();

    if (error || !data?.user) {
        window.location.replace("index.html");
        return false;
    }

    state.user = data.user;

    const { data: profile, error: profileError } =
        await state.supabase
            .from("profiles")
            .select("id, full_name, role, phone, login_name")
            .eq("id", state.user.id)
            .maybeSingle();

    if (profileError) {
        console.error("PROFILE QUERY ERROR:", profileError);
        throw new Error("تعذر قراءة بيانات حساب المعلم.");
    }

    if (!profile) {
        await state.supabase.auth.signOut();
        window.location.replace("index.html");
        return false;
    }

    if (profile.role !== "teacher") {
        await state.supabase.auth.signOut();
        window.location.replace("index.html");
        return false;
    }

    state.profile = profile;

    return true;
}

async function loadSchoolInformation() {
    const { data: memberships, error: membershipError } =
        await state.supabase
            .from("school_memberships")
            .select("school_id, role")
            .eq("profile_id", state.user.id)
            .eq("role", "teacher");

    if (membershipError) {
        console.error(
            "SCHOOL MEMBERSHIP QUERY ERROR:",
            membershipError
        );

        throw new Error(
            "تعذر التحقق من ارتباط المعلم بالمدرسة."
        );
    }

    if (!memberships?.length) {
        state.school = null;

        setText("schoolDisplayName", "غير مرتبط بمدرسة");
        setText("profileSchool", "غير مرتبط بمدرسة");

        return;
    }

    if (memberships.length > 1) {
        console.warn(
            "المعلم مرتبط بأكثر من مدرسة. سيتم استخدام أول عضوية.",
            memberships
        );
    }

    const membership = memberships[0];

    const { data: school, error: schoolError } =
        await state.supabase
            .from("schools")
            .select("id, name")
            .eq("id", membership.school_id)
            .maybeSingle();

    if (schoolError) {
        console.error("SCHOOL QUERY ERROR:", schoolError);
        throw new Error("تعذر جلب بيانات المدرسة.");
    }

    state.school = school || null;

    const schoolName = school?.name || "مدرستي";

    setText("schoolDisplayName", schoolName);
    setText("profileSchool", schoolName);
}

function renderProfile() {
    const profile = state.profile || {};
    const name = profile.full_name || "المعلم";
    const firstLetter = name.trim().charAt(0) || "م";

    setText("teacherDisplayName", name);
    setText("teacherAvatar", firstLetter);
    setText("profileAvatar", firstLetter);
    setText("profileFullName", name);
    setText("profileNameValue", name);
    setText("profileLoginName", profile.login_name || "—");
    setText("profilePhone", profile.phone || "—");

    if (state.school?.name) {
        setText("profileSchool", state.school.name);
    }
}

/* =========================================================
   NAVIGATION
   ========================================================= */

function openSection(sectionName) {
    const section = document.getElementById(
        `section-${sectionName}`
    );

    if (!section) return;

    document.querySelectorAll(".teacher-section").forEach(item => {
        item.classList.toggle("active", item === section);
    });

    document.querySelectorAll(
        ".teacher-nav-link[data-section]"
    ).forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.section === sectionName
        );
    });

    const activeButton = document.querySelector(
        `.teacher-nav-link[data-section="${sectionName}"]`
    );

    setText(
        "pageHeading",
        activeButton?.querySelector("span:last-child")?.textContent ||
        "بوابة المعلم"
    );

    closeMobileSidebar();

    if (sectionName === "homework") {
        populateHomeworkOptions();
        renderTeacherPosts();
    }

    if (sectionName === "assignments") {
        renderTeacherAssignments();
    }

    if (sectionName === "weekly") {
        renderWeeklySchedule();
    }

    if (sectionName === "announcements") {
        renderTeacherAnnouncements();
    }

    if (sectionName === "chat") {
        populateTeacherChatOptions();
        loadTeacherChatRooms();
    }

    if (sectionName === "profile") {
        renderProfile();
    }
}

function bindNavigation() {
    document.querySelectorAll(
        ".teacher-nav-link[data-section]"
    ).forEach(button => {
        button.addEventListener("click", () => {
            openSection(button.dataset.section);
        });
    });

    elements.mobileMenuButton?.addEventListener("click", () => {
        document.body.classList.toggle("sidebar-open");
    });

    elements.backdrop?.addEventListener(
        "click",
        closeMobileSidebar
    );
}

function closeMobileSidebar() {
    document.body.classList.remove("sidebar-open");
}

/* =========================================================
   TEACHER SCHEDULE
   ========================================================= */

async function loadTeacherSchedule() {
    setLoading(
        elements.lessonList,
        "جارٍ تحميل جدول المعلم..."
    );

    setLoading(
        elements.weeklyScheduleList,
        "جارٍ تحميل الجدول الأسبوعي..."
    );

    if (elements.refreshScheduleButton) {
        elements.refreshScheduleButton.disabled = true;
    }

    if (elements.refreshWeeklyScheduleButton) {
        elements.refreshWeeklyScheduleButton.disabled = true;
    }

    try {
        const result = await callHomeworkHandler(
            "teacher_schedule"
        );

        state.schedule = Array.isArray(result.schedule)
            ? result.schedule
            : [];

        if (Array.isArray(result.assignments)) {
            state.assignments = result.assignments;
        } else {
            buildTeacherAssignments();
        }

        renderSchedule();
        renderWeeklySchedule();
        renderTeacherAssignments();
        populateHomeworkOptions();
        populateTeacherChatOptions();
        updateStatistics();

        showPageMessage("", "info");

    } catch (error) {
        console.error("TEACHER SCHEDULE ERROR:", error);

        state.schedule = [];
        state.assignments = [];

        showEmpty(
            elements.lessonList,
            "تعذر تحميل الجدول",
            getErrorMessage(
                error,
                "تحقق من اتصال خدمة homework-handler."
            )
        );

        renderWeeklySchedule();
        renderTeacherAssignments();
        populateHomeworkOptions();
        populateTeacherChatOptions();
        updateStatistics();

        showPageMessage(
            getErrorMessage(
                error,
                "تعذر تحميل الجدول الدراسي."
            ),
            "error"
        );

    } finally {
        if (elements.refreshScheduleButton) {
            elements.refreshScheduleButton.disabled = false;
        }

        if (elements.refreshWeeklyScheduleButton) {
            elements.refreshWeeklyScheduleButton.disabled = false;
        }
    }
}

function buildTeacherAssignments() {
    const map = new Map();

    state.schedule.forEach(lesson => {
        const classInfo = lesson.class || {};
        const classId = Number(lesson.class_id);

        if (!Number.isSafeInteger(classId) || classId <= 0) {
            return;
        }

        if (!lesson.subject) return;

        const key = `${classId}|${lesson.subject}`;

        if (!map.has(key)) {
            map.set(key, {
                class_id: classId,
                school_id: Number(lesson.school_id),
                subject: lesson.subject,
                class: classInfo,
                lessons: []
            });
        }

        map.get(key).lessons.push(lesson);
    });

    state.assignments = [...map.values()];
}

function getVisibleLessons(dayId) {
    return state.schedule
        .filter(lesson => {
            const lessonDay = normalizeDay(lesson.day_of_week);

            return lessonDay === dayId &&
                lesson.is_published === true;
        })
        .sort((a, b) => {
            return Number(a.period || 0) -
                Number(b.period || 0);
        });
}

function renderTabs() {
    elements.dayTabs.forEach(tab => {
        const active = tab.dataset.day === state.selectedDay;

        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", String(active));
        tab.setAttribute("tabindex", active ? "0" : "-1");
    });
}

function renderSchedule() {
    const dayName = getDayName(state.selectedDay);
    const lessons = getVisibleLessons(state.selectedDay);

    setText("selectedDayTitle", `حصص ${dayName}`);

    setText(
        "selectedDayDescription",
        `الحصص المنشورة المسندة إليك ليوم ${dayName}`
    );

    setText(
        "lessonCounter",
        `${lessons.length} ${lessons.length === 1 ? "حصة" : "حصص"}`
    );

    if (!lessons.length) {
        showEmpty(
            elements.lessonList,
            "لا توجد حصص منشورة لهذا اليوم",
            "ستظهر هنا الحصص بعد نشر الجدول من إدارة المدرسة."
        );

        renderTabs();
        updateStatistics();

        return;
    }

    if (elements.lessonList) {
        elements.lessonList.innerHTML =
            lessons.map(renderLessonCard).join("");
    }

    renderTabs();
    updateStatistics();
}

/* =========================================================
   WEEKLY TEACHER SCHEDULE
   ========================================================= */

function renderWeeklySchedule() {
    if (!elements.weeklyScheduleList) return;

    const weeklyLessons = [];

    TEACHER_DAYS.forEach(day => {
        getVisibleLessons(day.id).forEach(lesson => {
            weeklyLessons.push({
                ...lesson,
                _dayId: day.id
            });
        });
    });

    if (!weeklyLessons.length) {
        showEmpty(
            elements.weeklyScheduleList,
            "لا توجد حصص منشورة",
            "ستظهر حصصك هنا بعد نشر الجدول وإسناد الحصص إليك من إدارة المدرسة."
        );

        return;
    }

    const periods = [...new Set(
        weeklyLessons.map(lesson =>
            String(lesson.period ?? "غير محددة")
        )
    )].sort((a, b) => {
        const first = Number(a);
        const second = Number(b);

        if (Number.isFinite(first) && Number.isFinite(second)) {
            return first - second;
        }

        return a.localeCompare(b, "ar");
    });

    const renderWeeklyLesson = lesson => {
        const className = classLabel(lesson.class || {});

        return `
            <article class="weekly-lesson-card">

                <div class="weekly-lesson-time">
                    <span>${escapeHTML(formatTime(lesson.start_time))}</span>
                    <span>${escapeHTML(formatTime(lesson.end_time))}</span>
                </div>

                <h4>
                    ${escapeHTML(lesson.subject || "مادة غير محددة")}
                </h4>

                <div class="weekly-lesson-class">
                    ${escapeHTML(className)}
                </div>

                ${lesson.note ? `
                    <p class="weekly-lesson-note">
                        ${escapeHTML(lesson.note)}
                    </p>
                ` : ""}

                <button
                    type="button"
                    class="primary-button weekly-homework-button"
                    data-action="create-homework"
                    data-class-id="${escapeHTML(lesson.class_id)}"
                    data-subject="${escapeHTML(lesson.subject)}">
                    ＋ إرسال واجب
                </button>

            </article>
        `;
    };

    const tableRows = periods.map(period => {
        const cells = TEACHER_DAYS.map(day => {
            const lessons = weeklyLessons.filter(lesson =>
                lesson._dayId === day.id &&
                String(lesson.period ?? "غير محددة") === period
            );

            return `
                <td>
                    <div class="weekly-cell-lessons">
                        ${
                            lessons.length
                                ? lessons.map(renderWeeklyLesson).join("")
                                : `<span class="weekly-empty-cell">—</span>`
                        }
                    </div>
                </td>
            `;
        }).join("");

        return `
            <tr>
                <th scope="row" class="weekly-period-cell">
                    <span>الحصة</span>
                    <strong>${escapeHTML(period)}</strong>
                </th>
                ${cells}
            </tr>
        `;
    }).join("");

    elements.weeklyScheduleList.innerHTML = `
        <div class="weekly-table-scroll">

            <table class="weekly-schedule-table">

                <thead>
                    <tr>
                        <th class="weekly-period-heading">الحصة</th>

                        ${TEACHER_DAYS.map(day => `
                            <th>${escapeHTML(day.name)}</th>
                        `).join("")}
                    </tr>
                </thead>

                <tbody>
                    ${tableRows}
                </tbody>

            </table>

        </div>

        <div class="weekly-table-footer">
            <span>إجمالي الحصص المنشورة</span>
            <strong>${weeklyLessons.length}</strong>
        </div>
    `;
}

/* =========================================================
   LESSON CARD
   ========================================================= */

function renderLessonCard(lesson) {
    const classInfo = lesson.class || {};
    const className = classLabel(classInfo);
    const dayId = normalizeDay(lesson.day_of_week);

    const timeStart = formatTime(lesson.start_time);
    const timeEnd = formatTime(lesson.end_time);

    return `
        <article class="lesson-card">
            <div class="lesson-time">
                <strong>${escapeHTML(timeStart)}</strong>
                <span>إلى ${escapeHTML(timeEnd)}</span>
            </div>

            <div class="lesson-info">
                <h4>${escapeHTML(lesson.subject || "مادة غير محددة")}</h4>

                <div class="lesson-meta">
                    <span>▦ ${escapeHTML(className)}</span>
                    <span>الحصة ${escapeHTML(lesson.period ?? "—")}</span>
                    <span>${escapeHTML(getDayName(dayId))}</span>
                </div>

                ${lesson.note ? `
                    <div class="lesson-assignment">
                        <p>${escapeHTML(lesson.note)}</p>
                    </div>
                ` : ""}
            </div>

            <div class="lesson-actions">
                <span class="assignment-status">جدول منشور</span>

                <button
                    type="button"
                    class="primary-button"
                    data-action="create-homework"
                    data-class-id="${escapeHTML(lesson.class_id)}"
                    data-subject="${escapeHTML(lesson.subject)}">
                    ＋ إرسال واجب
                </button>
            </div>
        </article>
    `;
}

/* =========================================================
   SCHEDULE EVENTS
   ========================================================= */

function handleLessonHomeworkClick(event) {
    const button = event.target.closest(
        '[data-action="create-homework"]'
    );

    if (!button) return;

    openSection("homework");

    if (elements.homeworkClass) {
        elements.homeworkClass.value = button.dataset.classId;

        updateHomeworkSubjects(button.dataset.subject);
    }
}

function bindScheduleEvents() {
    elements.dayTabs.forEach(tab => {
        tab.addEventListener("click", () => {
            state.selectedDay = tab.dataset.day;
            renderSchedule();
        });
    });

    elements.lessonList?.addEventListener(
        "click",
        handleLessonHomeworkClick
    );

    elements.weeklyScheduleList?.addEventListener(
        "click",
        handleLessonHomeworkClick
    );

    elements.refreshScheduleButton?.addEventListener(
        "click",
        loadTeacherSchedule
    );

    elements.refreshWeeklyScheduleButton?.addEventListener(
        "click",
        loadTeacherSchedule
    );
}

/* =========================================================
   ASSIGNMENTS
   ========================================================= */

function renderTeacherAssignments() {
    if (!state.assignments.length) {
        showEmpty(
            elements.teacherAssignmentsList,
            "لا توجد تكليفات ظاهرة",
            "ستظهر الشعب والمواد هنا عندما تصل تكليفات حسابك من النظام."
        );

        setText("assignedClassCount", "0");
        setText("assignedSubjectCount", "0");

        return;
    }

    const uniqueClasses = new Set(
        state.assignments.map(item => Number(item.class_id))
    );

    const uniqueSubjects = new Set(
        state.assignments.map(item => item.subject)
    );

    setText("assignedClassCount", uniqueClasses.size);
    setText("assignedSubjectCount", uniqueSubjects.size);

    if (!elements.teacherAssignmentsList) return;

    elements.teacherAssignmentsList.innerHTML =
        state.assignments.map(item => `
            <article class="teacher-assignment-card">
                <h3>${escapeHTML(classLabel(item.class))}</h3>

                <p>
                    المادة المسندة:
                    ${escapeHTML(item.subject)}
                </p>

                <div class="subject-tags">
                    <span class="subject-tag">
                        ${escapeHTML(item.subject)}
                    </span>

                    <span class="subject-tag">
                        ${(item.lessons || []).length} حصة في الجدول
                    </span>
                </div>
            </article>
        `).join("");
}

function bindAssignmentEvents() {
    elements.refreshAssignmentsButton?.addEventListener(
        "click",
        async () => {
            await loadTeacherSchedule();
            openSection("assignments");
        }
    );
}

/* =========================================================
   HOMEWORK FORM
   ========================================================= */

function populateHomeworkOptions() {
    if (!elements.homeworkClass ||
        !elements.homeworkSubject) {
        return;
    }

    const classes = new Map();

    state.assignments.forEach(item => {
        const key = String(item.class_id);

        if (!classes.has(key)) {
            classes.set(key, {
                id: item.class_id,
                label: classLabel(item.class)
            });
        }
    });

    const selectedValue = elements.homeworkClass.value;

    elements.homeworkClass.innerHTML = `
        <option value="">اختر الشعبة</option>

        ${[...classes.values()].map(item => `
            <option value="${escapeHTML(item.id)}">
                ${escapeHTML(item.label)}
            </option>
        `).join("")}
    `;

    if (selectedValue && classes.has(selectedValue)) {
        elements.homeworkClass.value = selectedValue;
    }

    updateHomeworkSubjects();
}

function updateHomeworkSubjects(preferredSubject = "") {
    if (!elements.homeworkSubject) return;

    const classId = Number(elements.homeworkClass?.value);

    if (!classId) {
        elements.homeworkSubject.innerHTML =
            '<option value="">اختر الشعبة أولاً</option>';

        elements.homeworkSubject.disabled = true;

        return;
    }

    const subjects = [...new Set(
        state.assignments
            .filter(item => Number(item.class_id) === classId)
            .map(item => item.subject)
    )];

    elements.homeworkSubject.innerHTML = `
        <option value="">اختر المادة</option>

        ${subjects.map(subject => `
            <option value="${escapeHTML(subject)}">
                ${escapeHTML(subject)}
            </option>
        `).join("")}
    `;

    elements.homeworkSubject.disabled = subjects.length === 0;

    if (preferredSubject && subjects.includes(preferredSubject)) {
        elements.homeworkSubject.value = preferredSubject;
    }
}

function validateSelectedFiles(files) {
    for (const file of files) {
        if (!ALLOWED_TYPES.includes(file.type)) {
            throw new Error(
                `الصورة "${file.name}" ليست بصيغة مدعومة. استخدم JPG أو PNG أو WEBP.`
            );
        }

        if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
            throw new Error(
                `حجم الصورة "${file.name}" غير مسموح. الحد الأقصى 10 ميغابايت للصورة.`
            );
        }
    }
}

function renderSelectedHomeworkFiles() {
    if (!elements.selectedFilesList) return;

    elements.selectedFilesList.innerHTML =
        state.selectedFiles.map((file, index) => `
            <div class="file-row">
                <span title="${escapeHTML(file.name)}">
                    ${escapeHTML(file.name)}
                    (${(file.size / 1024 / 1024).toFixed(2)} MB)
                </span>

                <button
                    type="button"
                    class="remove-file-button"
                    data-remove-file="${index}">
                    إزالة
                </button>
            </div>
        `).join("");
}

function bindHomeworkFileEvents() {
    elements.homeworkFiles?.addEventListener(
        "change",
        event => {
            const incoming = [...(event.target.files || [])];

            event.target.value = "";

            try {
                validateSelectedFiles(incoming);

                incoming.forEach(file => {
                    const duplicate = state.selectedFiles.some(item =>
                        item.name === file.name &&
                        item.size === file.size &&
                        item.lastModified === file.lastModified
                    );

                    if (!duplicate) {
                        state.selectedFiles.push(file);
                    }
                });

                renderSelectedHomeworkFiles();
                showHomeworkMessage("", "success");

            } catch (error) {
                showHomeworkMessage(error.message);
            }
        }
    );

    elements.selectedFilesList?.addEventListener(
        "click",
        event => {
            const button = event.target.closest(
                "[data-remove-file]"
            );

            if (!button) return;

            const index = Number(button.dataset.removeFile);

            if (
                !Number.isInteger(index) ||
                index < 0 ||
                index >= state.selectedFiles.length
            ) {
                return;
            }

            state.selectedFiles.splice(index, 1);

            renderSelectedHomeworkFiles();
        }
    );

    elements.resetHomeworkButton?.addEventListener(
        "click",
        () => {
            state.selectedFiles = [];

            renderSelectedHomeworkFiles();
            showHomeworkMessage("");
        }
    );
}

async function publishHomework(event) {
    event.preventDefault();

    if (state.isSaving) return;

    const classId = Number(elements.homeworkClass?.value);

    const subject = (
        elements.homeworkSubject?.value || ""
    ).trim();

    const content = (
        elements.homeworkContent?.value || ""
    ).trim();

    const targetDate = elements.homeworkTargetDate?.value || "";

    if (!Number.isSafeInteger(classId) || classId <= 0) {
        showHomeworkMessage("يرجى اختيار الشعبة.");
        return;
    }

    if (!subject) {
        showHomeworkMessage("يرجى اختيار المادة.");
        return;
    }

    if (!content) {
        showHomeworkMessage("يرجى كتابة نص الواجب.");
        return;
    }

    try {
        validateSelectedFiles(state.selectedFiles);
    } catch (error) {
        showHomeworkMessage(error.message);
        return;
    }

    const permitted = state.assignments.some(item =>
        Number(item.class_id) === classId &&
        item.subject === subject
    );

    if (!permitted) {
        showHomeworkMessage(
            "هذه المادة أو الشعبة ليست ضمن التكليفات المتاحة لحسابك."
        );

        return;
    }

    state.isSaving = true;

    if (elements.publishHomeworkButton) {
        elements.publishHomeworkButton.disabled = true;
        elements.publishHomeworkButton.textContent = "جارٍ النشر...";
    }

    try {
        const payload = {
            class_id: classId,
            subject,
            content,
            target_date: targetDate
        };

        const result = state.selectedFiles.length
            ? await callHomeworkHandlerWithFiles(
                "create",
                payload,
                state.selectedFiles
            )
            : await callHomeworkHandler("create", payload);

        showHomeworkMessage(
            result.message || "تم نشر الواجب بنجاح.",
            "success"
        );

        elements.homeworkForm?.reset();

        state.selectedFiles = [];

        renderSelectedHomeworkFiles();
        populateHomeworkOptions();

        await loadTeacherPosts();

        showPageMessage("تم نشر الواجب بنجاح.", "success");

    } catch (error) {
        console.error("PUBLISH HOMEWORK ERROR:", error);

        showHomeworkMessage(
            getErrorMessage(error, "تعذر نشر الواجب.")
        );

    } finally {
        state.isSaving = false;

        if (elements.publishHomeworkButton) {
            elements.publishHomeworkButton.disabled = false;
            elements.publishHomeworkButton.textContent = "نشر الواجب";
        }
    }
}

function bindHomeworkForm() {
    elements.homeworkClass?.addEventListener(
        "change",
        () => updateHomeworkSubjects()
    );

    elements.homeworkForm?.addEventListener(
        "submit",
        publishHomework
    );

    bindHomeworkFileEvents();

    elements.refreshHomeworkButton?.addEventListener(
        "click",
        loadTeacherPosts
    );
}

/* =========================================================
   TEACHER HOMEWORK LIST
   ========================================================= */

async function loadTeacherPosts() {
    if (!elements.teacherHomeworkList) return;

    if (elements.refreshHomeworkButton) {
        elements.refreshHomeworkButton.disabled = true;
    }

    setLoading(
        elements.teacherHomeworkList,
        "جارٍ تحميل واجباتك السابقة..."
    );

    try {
        const result = await callHomeworkHandler("teacher_posts");

        state.homeworkPosts = Array.isArray(result.posts)
            ? result.posts
            : [];

        renderTeacherPosts();
        updateStatistics();

    } catch (error) {
        console.error("LOAD TEACHER POSTS ERROR:", error);

        showEmpty(
            elements.teacherHomeworkList,
            "تعذر تحميل الواجبات",
            getErrorMessage(error, "حدث خطأ أثناء جلب واجباتك.")
        );

    } finally {
        if (elements.refreshHomeworkButton) {
            elements.refreshHomeworkButton.disabled = false;
        }
    }
}

function getPostAttachments(post) {
    const attachments = Array.isArray(post.attachments)
        ? post.attachments
        : [];

    return attachments.filter(item =>
        item && typeof item.url === "string" && item.url
    );
}

function renderPostAttachments(post) {
    const attachments = getPostAttachments(post);

    const attachmentMarkup = attachments.map(attachment => `
        <button
            type="button"
            class="homework-attachment"
            data-action="preview-image"
            data-image-url="${escapeHTML(attachment.url)}"
            data-image-name="${escapeHTML(attachment.file_name || "مرفق الواجب")}"
            title="عرض الصورة">

            <img
                src="${escapeHTML(attachment.url)}"
                alt="${escapeHTML(attachment.file_name || "صورة الواجب")}"
                loading="lazy">

            <span>${escapeHTML(attachment.file_name || "صورة")}</span>
        </button>
    `).join("");

    const legacyImage = post.image_url
        ? `
            <button
                type="button"
                class="homework-attachment"
                data-action="preview-image"
                data-image-url="${escapeHTML(post.image_url)}"
                data-image-name="صورة الواجب"
                title="عرض الصورة">

                <img
                    src="${escapeHTML(post.image_url)}"
                    alt="صورة الواجب"
                    loading="lazy">

                <span>صورة الواجب</span>
            </button>
        `
        : "";

    if (!attachmentMarkup && !legacyImage) {
        return "";
    }

    return `
        <div class="homework-attachments">
            ${attachmentMarkup}
            ${legacyImage}
        </div>
    `;
}

function renderTeacherPost(post) {
    const attachments = getPostAttachments(post);
    const attachmentCount = attachments.length +
        (post.image_url ? 1 : 0);

    return `
        <article class="teacher-homework-card" data-post-id="${escapeHTML(post.id)}">

            <div class="teacher-homework-header">

                <div class="teacher-homework-heading">
                    <span class="homework-type-label">واجب منزلي</span>

                    <h3>${escapeHTML(post.subject || "مادة غير محددة")}</h3>

                    <p>
                        ${escapeHTML(
                            post.class?.grade_name ||
                            post.class?.name ||
                            "الشعبة"
                        )}
                        ${post.class?.gender
                            ? ` — ${escapeHTML(post.class.gender)}`
                            : ""}
                        ${post.class?.section_name
                            ? ` — شعبة ${escapeHTML(post.class.section_name)}`
                            : ""}
                    </p>
                </div>

                <div class="homework-card-actions">

                    <button
                        type="button"
                        class="secondary-button"
                        data-action="edit-post"
                        data-post-id="${escapeHTML(post.id)}">
                        تعديل
                    </button>

                    <button
                        type="button"
                        class="danger-button"
                        data-action="delete-post"
                        data-post-id="${escapeHTML(post.id)}">
                        حذف
                    </button>

                </div>

            </div>

            <div class="teacher-homework-content">
                ${escapeHTML(post.content || "").replace(/\n/g, "<br>")}
            </div>

            ${renderPostAttachments(post)}

            <div class="teacher-homework-footer">

                <span>
                    <strong>تاريخ النشر:</strong>
                    ${escapeHTML(formatDateTime(post.created_at))}
                </span>

                <span>
                    <strong>التاريخ المحدد:</strong>
                    ${escapeHTML(formatDate(post.target_date))}
                </span>

                <span>
                    <strong>المرفقات:</strong>
                    ${attachmentCount}
                </span>

            </div>

        </article>
    `;
}

function renderTeacherPosts() {
    if (!elements.teacherHomeworkList) return;

    if (!state.homeworkPosts.length) {
        showEmpty(
            elements.teacherHomeworkList,
            "لا توجد واجبات منشورة",
            "ستظهر هنا الواجبات التي تنشرها لطلابك."
        );

        updateStatistics();
        return;
    }

    elements.teacherHomeworkList.innerHTML =
        state.homeworkPosts.map(renderTeacherPost).join("");

    updateStatistics();
}

function findTeacherPost(postId) {
    return state.homeworkPosts.find(
        post => String(post.id) === String(postId)
    ) || null;
}

async function handleTeacherPostsClick(event) {
    const previewButton = event.target.closest(
        '[data-action="preview-image"]'
    );

    if (previewButton) {
        openImageModal(
            previewButton.dataset.imageUrl,
            previewButton.dataset.imageName
        );

        return;
    }

    const editButton = event.target.closest(
        '[data-action="edit-post"]'
    );

    if (editButton) {
        const post = findTeacherPost(editButton.dataset.postId);

        if (!post) {
            showPageMessage("تعذر العثور على الواجب المطلوب.", "error");
            return;
        }

        openAssignmentModal(post);
        return;
    }

    const deleteButton = event.target.closest(
        '[data-action="delete-post"]'
    );

    if (deleteButton) {
        await deleteTeacherPost(deleteButton.dataset.postId);
    }
}

function bindTeacherPostsEvents() {
    elements.teacherHomeworkList?.addEventListener(
        "click",
        handleTeacherPostsClick
    );
}

/* =========================================================
   HOMEWORK EDIT MODAL
   ========================================================= */

function openAssignmentModal(post) {
    if (!post || !elements.assignmentModal) return;

    state.editingPost = post;
    state.modalSelectedFiles = [];
    state.removeAttachmentIds = new Set();

    elements.assignmentForm?.reset();

    if (elements.postId) {
        elements.postId.value = post.id;
    }

    if (elements.modalTitle) {
        elements.modalTitle.textContent = "تعديل الواجب";
    }

    if (elements.modalLessonInfo) {
        elements.modalLessonInfo.textContent =
            `${post.subject || "المادة"} — ${classLabel(post.class)}`;
    }

    if (elements.assignmentClass) {
        elements.assignmentClass.innerHTML = `
            <option value="${escapeHTML(post.class_id)}">
                ${escapeHTML(classLabel(post.class))}
            </option>
        `;
    }

    if (elements.assignmentSubject) {
        elements.assignmentSubject.innerHTML = `
            <option value="${escapeHTML(post.subject)}">
                ${escapeHTML(post.subject)}
            </option>
        `;
    }

    if (elements.assignmentDescription) {
        elements.assignmentDescription.value = post.content || "";
    }

    if (elements.assignmentTargetDate) {
        elements.assignmentTargetDate.value = post.target_date || "";
    }

    if (elements.attachmentFiles) {
        elements.attachmentFiles.value = "";
    }

    renderExistingAttachments(post);
    renderModalSelectedFiles();

    showModalMessage("");

    if (!elements.assignmentModal.open) {
        elements.assignmentModal.showModal();
    }
}

function renderExistingAttachments(post) {
    if (!elements.existingAttachments) return;

    const attachments = getPostAttachments(post);

    if (!attachments.length && !post.image_url) {
        elements.existingAttachments.innerHTML = `
            <p class="empty-attachments">
                لا توجد صور مرفقة بهذا الواجب.
            </p>
        `;

        return;
    }

    const items = attachments.map(attachment => {
        const isRemoved = state.removeAttachmentIds.has(
            Number(attachment.id)
        );

        return `
            <div class="existing-attachment-row ${isRemoved ? "marked-for-removal" : ""}">

                <img
                    src="${escapeHTML(attachment.url)}"
                    alt="${escapeHTML(attachment.file_name || "مرفق")}"
                    loading="lazy">

                <div class="existing-attachment-info">
                    <span>${escapeHTML(attachment.file_name || "صورة")}</span>
                    <small>${isRemoved ? "سيُحذف عند الحفظ" : "مرفق حالي"}</small>
                </div>

                <button
                    type="button"
                    class="remove-file-button"
                    data-remove-attachment="${escapeHTML(attachment.id)}">
                    ${isRemoved ? "تراجع" : "إزالة"}
                </button>

            </div>
        `;
    }).join("");

    const legacy = post.image_url
        ? `
            <div class="existing-attachment-row">
                <img
                    src="${escapeHTML(post.image_url)}"
                    alt="صورة الواجب">

                <div class="existing-attachment-info">
                    <span>صورة مرتبطة بالواجب</span>
                    <small>صورة قديمة</small>
                </div>
            </div>
        `
        : "";

    elements.existingAttachments.innerHTML = items + legacy;
}

function renderModalSelectedFiles() {
    if (!elements.modalSelectedFiles) return;

    elements.modalSelectedFiles.innerHTML =
        state.modalSelectedFiles.map((file, index) => `
            <div class="file-row">

                <span title="${escapeHTML(file.name)}">
                    ${escapeHTML(file.name)}
                    (${(file.size / 1024 / 1024).toFixed(2)} MB)
                </span>

                <button
                    type="button"
                    class="remove-file-button"
                    data-remove-modal-file="${index}">
                    إزالة
                </button>

            </div>
        `).join("");
}

function handleExistingAttachmentClick(event) {
    const button = event.target.closest(
        "[data-remove-attachment]"
    );

    if (!button || !state.editingPost) return;

    const attachmentId = Number(
        button.dataset.removeAttachment
    );

    if (!Number.isSafeInteger(attachmentId) || attachmentId <= 0) {
        return;
    }

    if (state.removeAttachmentIds.has(attachmentId)) {
        state.removeAttachmentIds.delete(attachmentId);
    } else {
        state.removeAttachmentIds.add(attachmentId);
    }

    renderExistingAttachments(state.editingPost);
}

function handleModalFileSelection(event) {
    const incoming = [...(event.target.files || [])];

    event.target.value = "";

    try {
        validateSelectedFiles(incoming);

        incoming.forEach(file => {
            const duplicate = state.modalSelectedFiles.some(item =>
                item.name === file.name &&
                item.size === file.size &&
                item.lastModified === file.lastModified
            );

            if (!duplicate) {
                state.modalSelectedFiles.push(file);
            }
        });

        renderModalSelectedFiles();
        showModalMessage("");

    } catch (error) {
        showModalMessage(error.message);
    }
}

function handleModalSelectedFileClick(event) {
    const button = event.target.closest(
        "[data-remove-modal-file]"
    );

    if (!button) return;

    const index = Number(button.dataset.removeModalFile);

    if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= state.modalSelectedFiles.length
    ) {
        return;
    }

    state.modalSelectedFiles.splice(index, 1);

    renderModalSelectedFiles();
}

async function saveAssignmentChanges(event) {
    event.preventDefault();

    if (state.isSaving) return;

    const post = state.editingPost;

    if (!post) {
        showModalMessage("لم يتم تحديد الواجب المراد تعديله.");
        return;
    }

    const content = (
        elements.assignmentDescription?.value || ""
    ).trim();

    const targetDate =
        elements.assignmentTargetDate?.value || "";

    if (!content) {
        showModalMessage("يرجى كتابة محتوى الواجب.");
        return;
    }

    try {
        validateSelectedFiles(state.modalSelectedFiles);
    } catch (error) {
        showModalMessage(error.message);
        return;
    }

    const currentAttachments = getPostAttachments(post);

    const remainingCount =
        currentAttachments.filter(item =>
            !state.removeAttachmentIds.has(Number(item.id))
        ).length +
        state.modalSelectedFiles.length;

    if (remainingCount > 10) {
        showModalMessage(
            "لا يمكن أن يتجاوز مجموع المرفقات 10 صور."
        );
        return;
    }

    state.isSaving = true;

    if (elements.saveAssignmentButton) {
        elements.saveAssignmentButton.disabled = true;
        elements.saveAssignmentButton.textContent = "جارٍ الحفظ...";
    }

    try {
        const removeIds = [...state.removeAttachmentIds];

        const payload = {
            post_id: Number(post.id),
            content,
            target_date: targetDate,
            remove_attachment_ids: removeIds
        };

        const result = state.modalSelectedFiles.length
            ? await callHomeworkHandlerWithFiles(
                "update",
                payload,
                state.modalSelectedFiles
            )
            : await callHomeworkHandler(
                "update",
                payload
            );

        closeAssignmentModal();

        await loadTeacherPosts();

        if (result.warning) {
            showPageMessage(result.warning, "error");
        } else {
            showPageMessage(
                result.message || "تم تحديث الواجب بنجاح.",
                "success"
            );
        }

    } catch (error) {
        console.error("UPDATE HOMEWORK ERROR:", error);

        showModalMessage(
            getErrorMessage(error, "تعذر تحديث الواجب.")
        );

    } finally {
        state.isSaving = false;

        if (elements.saveAssignmentButton) {
            elements.saveAssignmentButton.disabled = false;
            elements.saveAssignmentButton.textContent = "حفظ التعديلات";
        }
    }
}

function closeAssignmentModal() {
    if (elements.assignmentModal?.open) {
        elements.assignmentModal.close();
    }

    elements.assignmentForm?.reset();

    state.editingPost = null;
    state.modalSelectedFiles = [];
    state.removeAttachmentIds.clear();

    if (elements.modalSelectedFiles) {
        elements.modalSelectedFiles.innerHTML = "";
    }

    if (elements.existingAttachments) {
        elements.existingAttachments.innerHTML = "";
    }

    showModalMessage("");
}

function bindModalEvents() {
    elements.closeModalButton?.addEventListener(
        "click",
        closeAssignmentModal
    );

    elements.cancelModalButton?.addEventListener(
        "click",
        closeAssignmentModal
    );

    elements.assignmentModal?.addEventListener(
        "click",
        event => {
            if (event.target === elements.assignmentModal) {
                closeAssignmentModal();
            }
        }
    );

    elements.assignmentForm?.addEventListener(
        "submit",
        saveAssignmentChanges
    );

    elements.existingAttachments?.addEventListener(
        "click",
        handleExistingAttachmentClick
    );

    elements.attachmentFiles?.addEventListener(
        "change",
        handleModalFileSelection
    );

    elements.modalSelectedFiles?.addEventListener(
        "click",
        handleModalSelectedFileClick
    );

    elements.closeImageButton?.addEventListener(
        "click",
        closeImageModal
    );

    elements.imageModal?.addEventListener(
        "click",
        event => {
            if (event.target === elements.imageModal) {
                closeImageModal();
            }
        }
    );
}

/* =========================================================
   DELETE HOMEWORK
   ========================================================= */

async function deleteTeacherPost(postId) {
    if (state.isDeleting) return;

    const post = findTeacherPost(postId);

    if (!post) {
        showPageMessage("تعذر العثور على الواجب المطلوب.", "error");
        return;
    }

    const confirmed = window.confirm(
        `هل أنت متأكد من حذف واجب مادة "${post.subject || "غير محددة"}"؟\nسيتم حذف الواجب ومرفقاته.`
    );

    if (!confirmed) return;

    state.isDeleting = true;

    const deleteButton = elements.teacherHomeworkList?.querySelector(
        `[data-action="delete-post"][data-post-id="${CSS.escape(String(postId))}"]`
    );

    if (deleteButton) {
        deleteButton.disabled = true;
        deleteButton.textContent = "جارٍ الحذف...";
    }

    try {
        const result = await callHomeworkHandler("delete", {
            post_id: Number(postId)
        });

        await loadTeacherPosts();

        showPageMessage(
            result.message || "تم حذف الواجب بنجاح.",
            "success"
        );

    } catch (error) {
        console.error("DELETE HOMEWORK ERROR:", error);

        showPageMessage(
            getErrorMessage(error, "تعذر حذف الواجب."),
            "error"
        );

    } finally {
        state.isDeleting = false;
    }
}

/* =========================================================
   IMAGE PREVIEW
   ========================================================= */

function openImageModal(url, name = "") {
    if (!url || !elements.imageModal || !elements.previewImage) {
        return;
    }

    elements.previewImage.src = url;
    elements.previewImage.alt = name || "صورة مرفقة";

    setText("previewImageName", name || "صورة مرفقة");

    if (!elements.imageModal.open) {
        elements.imageModal.showModal();
    }
}

function closeImageModal() {
    if (elements.imageModal?.open) {
        elements.imageModal.close();
    }

    if (elements.previewImage) {
        elements.previewImage.src = "";
    }

    setText("previewImageName", "");
}

/* =========================================================
   STATISTICS
   ========================================================= */

function updateStatistics() {
    const todayLessons = getVisibleLessons(state.selectedDay);

    setText("todayLessonCount", todayLessons.length);
    setText("assignmentCount", state.assignments.length);

    const attachmentCount = state.homeworkPosts.reduce(
        (total, post) => {
            return total +
                getPostAttachments(post).length +
                (post.image_url ? 1 : 0);
        },
        0
    );

    setText("attachmentCount", attachmentCount);

    // عدد إعلانات المدرسة التي لم يشاهدها المعلم بعد.
    setText(
        "unreadAnnouncementCount",
        getUnreadAnnouncementCount()
    );
}

/* =========================================================
   TEACHER CHAT — ASSIGNMENT OPTIONS
   ========================================================= */

function populateTeacherChatOptions() {
    if (!elements.teacherChatClass ||
        !elements.teacherChatSubject) {
        return;
    }

    const previousClassId = elements.teacherChatClass.value;
    const previousSubject = elements.teacherChatSubject.value;

    const classes = new Map();

    state.assignments.forEach(item => {
        const classId = Number(item.class_id);

        if (!Number.isSafeInteger(classId) || classId <= 0) {
            return;
        }

        if (!classes.has(String(classId))) {
            classes.set(String(classId), {
                id: classId,
                label: classLabel(item.class)
            });
        }
    });

    elements.teacherChatClass.innerHTML = `
        <option value="">اختر الشعبة</option>

        ${[...classes.values()].map(item => `
            <option value="${escapeHTML(item.id)}">
                ${escapeHTML(item.label)}
            </option>
        `).join("")}
    `;

    if (previousClassId && classes.has(previousClassId)) {
        elements.teacherChatClass.value = previousClassId;
    }

    updateTeacherChatSubjects(previousSubject);
}

function updateTeacherChatSubjects(preferredSubject = "") {
    if (!elements.teacherChatSubject) return;

    const classId = Number(elements.teacherChatClass?.value);

    if (!classId) {
        elements.teacherChatSubject.innerHTML =
            '<option value="">اختر الشعبة أولاً</option>';

        elements.teacherChatSubject.disabled = true;

        if (elements.openTeacherChatRoomButton) {
            elements.openTeacherChatRoomButton.disabled = true;
        }

        return;
    }

    const subjects = [...new Set(
        state.assignments
            .filter(item => Number(item.class_id) === classId)
            .map(item => item.subject)
            .filter(Boolean)
    )];

    elements.teacherChatSubject.innerHTML = `
        <option value="">اختر المادة</option>

        ${subjects.map(subject => `
            <option value="${escapeHTML(subject)}">
                ${escapeHTML(subject)}
            </option>
        `).join("")}
    `;

    elements.teacherChatSubject.disabled = subjects.length === 0;

    if (preferredSubject && subjects.includes(preferredSubject)) {
        elements.teacherChatSubject.value = preferredSubject;
    }

    updateTeacherChatOpenButton();
}

function updateTeacherChatOpenButton() {
    if (!elements.openTeacherChatRoomButton) return;

    const classId = Number(elements.teacherChatClass?.value);
    const subject = elements.teacherChatSubject?.value || "";

    const permitted = state.assignments.some(item =>
        Number(item.class_id) === classId &&
        item.subject === subject
    );

    elements.openTeacherChatRoomButton.disabled =
        !permitted || state.isOpeningTeacherChat;
}

function showTeacherChatActionMessage(message, type = "error") {
    if (!elements.teacherChatActionMessage) return;

    elements.teacherChatActionMessage.textContent = message;
    elements.teacherChatActionMessage.className =
        `form-message ${type === "success" ? "success" : ""}`;

    elements.teacherChatActionMessage.hidden = !message;
}

function showTeacherChatMessageStatus(message, type = "error") {
    if (!elements.teacherChatMessageStatus) return;

    elements.teacherChatMessageStatus.textContent = message;
    elements.teacherChatMessageStatus.className =
        `form-message ${type === "success" ? "success" : ""}`;

    elements.teacherChatMessageStatus.hidden = !message;
}

function findTeacherChatAssignment(classId, subject) {
    return state.assignments.find(item =>
        Number(item.class_id) === Number(classId) &&
        item.subject === subject
    ) || null;
}

function getTeacherChatRoomClassLabel(room) {
    const assignment = findTeacherChatAssignment(
        room.class_id,
        room.subject
    );

    if (assignment?.class) {
        return classLabel(assignment.class);
    }

    if (room.class) {
        return classLabel(room.class);
    }

    return `الشعبة رقم ${room.class_id ?? "—"}`;
}

function getTeacherChatRoomStatus(room) {
    return room?.status === "open" ? "مفتوحة" : "مغلقة";
}

function formatDuration(seconds) {
    const total = Math.max(0, Number(seconds) || 0);

    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const remainingSeconds = total % 60;

    if (hours > 0) {
        return `${hours} ساعة و${minutes} دقيقة`;
    }

    if (minutes > 0) {
        return `${minutes} دقيقة`;
    }

    return `${remainingSeconds} ثانية`;
}

function getTeacherChatRoomDuration(room) {
    if (room?.duration_seconds !== null &&
        room?.duration_seconds !== undefined) {
        return formatDuration(room.duration_seconds);
    }

    if (room?.status === "open" && room?.opened_at) {
        const elapsed = Math.floor(
            (Date.now() - new Date(room.opened_at).getTime()) / 1000
        );

        return formatDuration(elapsed);
    }

    return "—";
}

function updateTeacherChatBadge() {
    if (!elements.teacherChatBadge) return;

    const openCount = state.teacherChatRooms.filter(room =>
        room.status === "open"
    ).length;

    elements.teacherChatBadge.textContent = String(openCount);
    elements.teacherChatBadge.hidden = openCount === 0;
}

/* =========================================================
   TEACHER CHAT — ROOMS LIST
   ========================================================= */

async function loadTeacherChatRooms(options = {}) {
    if (!elements.teacherChatRoomsList) return;

    const preserveSelection = options.preserveSelection !== false;
    const selectedRoomId = preserveSelection
        ? state.selectedTeacherChatRoom?.id
        : null;

    if (elements.refreshTeacherChatButton) {
        elements.refreshTeacherChatButton.disabled = true;
    }

    setLoading(
        elements.teacherChatRoomsList,
        "جارٍ تحميل غرف الأسئلة..."
    );

    try {
        const result = await callTeacherChatHandler(
            "teacher_list_rooms"
        );

        state.teacherChatRooms = Array.isArray(result.rooms)
            ? result.rooms
            : [];

        renderTeacherChatRooms();
        updateTeacherChatBadge();

        if (selectedRoomId) {
            const updatedRoom = state.teacherChatRooms.find(room =>
                String(room.id) === String(selectedRoomId)
            );

            if (updatedRoom) {
                state.selectedTeacherChatRoom = updatedRoom;
                renderTeacherChatConversationHeader();
            } else {
                state.selectedTeacherChatRoom = null;
                state.teacherChatMessages = [];

                if (elements.teacherChatConversationPanel) {
                    elements.teacherChatConversationPanel.hidden = true;
                }
            }
        }

    } catch (error) {
        console.error("LOAD TEACHER CHAT ROOMS ERROR:", error);

        showEmpty(
            elements.teacherChatRoomsList,
            "تعذر تحميل غرف الأسئلة",
            getErrorMessage(
                error,
                "تعذر جلب قائمة غرف الأسئلة."
            )
        );

    } finally {
        if (elements.refreshTeacherChatButton) {
            elements.refreshTeacherChatButton.disabled = false;
        }
    }
}

function renderTeacherChatRooms() {
    if (!elements.teacherChatRoomsList) return;

    if (!state.teacherChatRooms.length) {
        showEmpty(
            elements.teacherChatRoomsList,
            "لا توجد غرف أسئلة بعد",
            "يمكنك فتح غرفة جديدة للشعبة والمادة المسندتين إليك."
        );

        updateTeacherChatBadge();
        return;
    }

    const sortedRooms = [...state.teacherChatRooms].sort((a, b) => {
        const aTime = new Date(
            a.opened_at || a.created_at || 0
        ).getTime();

        const bTime = new Date(
            b.opened_at || b.created_at || 0
        ).getTime();

        return bTime - aTime;
    });

    elements.teacherChatRoomsList.innerHTML =
        sortedRooms.map(room => {
            const isOpen = room.status === "open";

            const isSelected =
                String(state.selectedTeacherChatRoom?.id) ===
                String(room.id);

            return `
                <article
                    class="teacher-chat-room-card ${isOpen ? "is-open" : "is-closed"} ${isSelected ? "selected" : ""}"
                    data-room-id="${escapeHTML(room.id)}">

                    <div class="teacher-chat-room-card-heading">

                        <div>
                            <h3>${escapeHTML(room.subject || "مادة غير محددة")}</h3>

                            <p>
                                ${escapeHTML(getTeacherChatRoomClassLabel(room))}
                            </p>
                        </div>

                        <span class="teacher-chat-room-status ${isOpen ? "open" : "closed"}">
                            ${isOpen ? "مفتوحة" : "مغلقة"}
                        </span>

                    </div>

                    <div class="teacher-chat-room-meta">

                        <span>
                            <strong>وقت الفتح:</strong>
                            ${escapeHTML(formatDateTime(room.opened_at))}
                        </span>

                        <span>
                            <strong>وقت الإغلاق:</strong>
                            ${escapeHTML(formatDateTime(room.closed_at))}
                        </span>

                        <span>
                            <strong>المدة:</strong>
                            ${escapeHTML(getTeacherChatRoomDuration(room))}
                        </span>

                    </div>

                    <button
                        type="button"
                        class="secondary-button teacher-chat-view-button"
                        data-action="view-chat-room"
                        data-room-id="${escapeHTML(room.id)}">
                        عرض المحادثة
                    </button>

                </article>
            `;
        }).join("");

    updateTeacherChatBadge();
}

/* =========================================================
   TEACHER CHAT — OPEN ROOM
   ========================================================= */

async function openTeacherChatRoom() {
    if (state.isOpeningTeacherChat) return;

    const classId = Number(elements.teacherChatClass?.value);
    const subject = (
        elements.teacherChatSubject?.value || ""
    ).trim();

    if (!Number.isSafeInteger(classId) || classId <= 0) {
        showTeacherChatActionMessage("يرجى اختيار الشعبة.");
        return;
    }

    if (!subject) {
        showTeacherChatActionMessage("يرجى اختيار المادة.");
        return;
    }

    const permitted = findTeacherChatAssignment(classId, subject);

    if (!permitted) {
        showTeacherChatActionMessage(
            "هذه الشعبة أو المادة ليست ضمن تكليفات حسابك."
        );

        return;
    }

    state.isOpeningTeacherChat = true;
    updateTeacherChatOpenButton();

    if (elements.openTeacherChatRoomButton) {
        elements.openTeacherChatRoomButton.textContent = "جارٍ فتح الغرفة...";
    }

    try {
        const result = await callTeacherChatHandler(
            "teacher_open_room",
            {
                class_id: classId,
                subject
            }
        );

        if (!result.room?.id) {
            throw new Error("لم يُرجع النظام بيانات الغرفة الجديدة.");
        }

        showTeacherChatActionMessage(
            result.message || "تم فتح غرفة الأسئلة بنجاح.",
            "success"
        );

        await loadTeacherChatRooms({
            preserveSelection: false
        });

        const room = state.teacherChatRooms.find(item =>
            String(item.id) === String(result.room.id)
        ) || result.room;

        await selectTeacherChatRoom(room);

    } catch (error) {
        console.error("OPEN TEACHER CHAT ROOM ERROR:", error);

        showTeacherChatActionMessage(
            getErrorMessage(error, "تعذر فتح غرفة الأسئلة.")
        );

    } finally {
        state.isOpeningTeacherChat = false;

        if (elements.openTeacherChatRoomButton) {
            elements.openTeacherChatRoomButton.textContent = "فتح الغرفة";
        }

        updateTeacherChatOpenButton();
    }
}

/* =========================================================
   TEACHER CHAT — SELECT ROOM AND LOAD MESSAGES
   ========================================================= */

async function selectTeacherChatRoom(room) {
    if (!room?.id) return;

    state.selectedTeacherChatRoom = room;
    state.teacherChatMessages = [];

    if (elements.teacherChatConversationPanel) {
        elements.teacherChatConversationPanel.hidden = false;
    }

    renderTeacherChatRooms();
    renderTeacherChatConversationHeader();

    await loadTeacherChatMessages(room.id);
}

function renderTeacherChatConversationHeader() {
    const room = state.selectedTeacherChatRoom;

    if (!room) return;

    setText(
        "teacherChatRoomTitle",
        `${room.subject || "غرفة الأسئلة"} — ${getTeacherChatRoomClassLabel(room)}`
    );

    const status = room.status === "open"
        ? "الغرفة مفتوحة ويمكنك استقبال الأسئلة وإرسال الإجابات."
        : "الغرفة مغلقة. يمكنك قراءة المحادثة السابقة فقط.";

    const details = [
        `الحالة: ${getTeacherChatRoomStatus(room)}`,
        `وقت الفتح: ${formatDateTime(room.opened_at)}`,
        `وقت الإغلاق: ${formatDateTime(room.closed_at)}`,
        `المدة: ${getTeacherChatRoomDuration(room)}`
    ].join(" · ");

    setText(
        "teacherChatRoomStatus",
        `${status} ${details}`
    );

    const isOpen = room.status === "open";

    if (elements.closeTeacherChatRoomButton) {
        elements.closeTeacherChatRoomButton.hidden = !isOpen;
        elements.closeTeacherChatRoomButton.disabled =
            state.isClosingTeacherChat;
        elements.closeTeacherChatRoomButton.textContent =
            state.isClosingTeacherChat
                ? "جارٍ الإغلاق..."
                : "إغلاق الغرفة";
    }

    if (elements.teacherChatMessageInput) {
        elements.teacherChatMessageInput.disabled =
            !isOpen || state.isSendingTeacherChatMessage;

        elements.teacherChatMessageInput.placeholder = isOpen
            ? "اكتب إجابتك عن سؤال الطالب..."
            : "الغرفة مغلقة. المحادثة للقراءة فقط.";
    }

    if (elements.sendTeacherChatMessageButton) {
        elements.sendTeacherChatMessageButton.disabled =
            !isOpen || state.isSendingTeacherChatMessage;
    }
}

async function loadTeacherChatMessages(roomId) {
    if (!roomId || !elements.teacherChatMessages) return;

    state.isLoadingTeacherChat = true;

    setLoading(
        elements.teacherChatMessages,
        "جارٍ تحميل المحادثة السابقة..."
    );

    try {
        const result = await callTeacherChatHandler(
            "get_room_messages",
            {
                room_id: roomId
            }
        );

        state.teacherChatMessages = Array.isArray(result.messages)
            ? result.messages
            : [];

        if (result.room) {
            state.selectedTeacherChatRoom = {
                ...state.selectedTeacherChatRoom,
                ...result.room
            };
        }

        renderTeacherChatMessages();
        renderTeacherChatConversationHeader();

    } catch (error) {
        console.error("LOAD TEACHER CHAT MESSAGES ERROR:", error);

        showEmpty(
            elements.teacherChatMessages,
            "تعذر تحميل المحادثة",
            getErrorMessage(error, "حدث خطأ أثناء تحميل رسائل الغرفة.")
        );

    } finally {
        state.isLoadingTeacherChat = false;
    }
}

/* =========================================================
   TEACHER CHAT — RENDER MESSAGES
   ========================================================= */

function renderTeacherChatMessages() {
    if (!elements.teacherChatMessages) return;

    if (!state.teacherChatMessages.length) {
        showEmpty(
            elements.teacherChatMessages,
            "لا توجد رسائل في هذه الغرفة",
            "ستظهر أسئلة الطلاب هنا عند إرسالها."
        );

        return;
    }

    const messages = [...state.teacherChatMessages].sort((a, b) => {
        const first = new Date(a.created_at || 0).getTime();
        const second = new Date(b.created_at || 0).getTime();

        return first - second;
    });

    elements.teacherChatMessages.innerHTML =
        messages.map(renderTeacherChatMessage).join("");

    elements.teacherChatMessages.scrollTop =
        elements.teacherChatMessages.scrollHeight;
}

function renderTeacherChatMessage(message) {
    const isTeacher = message.sender_role === "teacher";

    const senderName = message.sender_name ||
        (isTeacher ? state.profile?.full_name : "طالب");

    return `
        <article class="teacher-chat-message ${isTeacher ? "teacher-message" : "student-message"}">

            <div class="teacher-chat-message-header">
                <strong>${escapeHTML(senderName || (isTeacher ? "المعلم" : "الطالب"))}</strong>

                <span>
                    ${isTeacher ? "إجابة المعلم" : "سؤال الطالب"}
                </span>
            </div>

            <div class="teacher-chat-message-content">
                ${escapeHTML(message.message || "").replace(/\n/g, "<br>")}
            </div>

            <div class="teacher-chat-message-time">
                ${escapeHTML(formatDateTime(message.created_at))}
            </div>

        </article>
    `;
}

/* =========================================================
   TEACHER CHAT — CLOSE ROOM
   ========================================================= */

async function closeTeacherChatRoom() {
    if (state.isClosingTeacherChat) return;

    const room = state.selectedTeacherChatRoom;

    if (!room?.id || room.status !== "open") {
        return;
    }

    const confirmed = window.confirm(
        "هل تريد إغلاق غرفة الأسئلة؟\nبعد الإغلاق ستبقى المحادثة متاحة للقراءة فقط، ولن يمكن إرسال رسائل جديدة."
    );

    if (!confirmed) return;

    state.isClosingTeacherChat = true;

    renderTeacherChatConversationHeader();

    try {
        const result = await callTeacherChatHandler(
            "teacher_close_room",
            {
                room_id: room.id
            }
        );

        if (result.room) {
            state.selectedTeacherChatRoom = {
                ...room,
                ...result.room
            };
        } else {
            state.selectedTeacherChatRoom = {
                ...room,
                status: "closed",
                closed_at: new Date().toISOString(),
                duration_seconds: result.duration_seconds ??
                    room.duration_seconds
            };
        }

        showTeacherChatActionMessage(
            result.message || "تم إغلاق الغرفة بنجاح.",
            "success"
        );

        showTeacherChatMessageStatus(
            "أُغلقت الغرفة. أصبحت المحادثة للقراءة فقط.",
            "success"
        );

        await loadTeacherChatRooms();

        await loadTeacherChatMessages(
            state.selectedTeacherChatRoom.id
        );

    } catch (error) {
        console.error("CLOSE TEACHER CHAT ROOM ERROR:", error);

        showTeacherChatActionMessage(
            getErrorMessage(error, "تعذر إغلاق غرفة الأسئلة.")
        );

    } finally {
        state.isClosingTeacherChat = false;
        renderTeacherChatConversationHeader();
    }
}

/* =========================================================
   TEACHER CHAT — SEND MESSAGE
   ========================================================= */

async function sendTeacherChatMessage(event) {
    event.preventDefault();

    if (state.isSendingTeacherChatMessage) return;

    const room = state.selectedTeacherChatRoom;

    if (!room?.id) {
        showTeacherChatMessageStatus("يرجى اختيار غرفة أولاً.");
        return;
    }

    if (room.status !== "open") {
        showTeacherChatMessageStatus(
            "الغرفة مغلقة. لا يمكن إرسال رسائل جديدة."
        );

        return;
    }

    const message = (
        elements.teacherChatMessageInput?.value || ""
    ).trim();

    if (!message) {
        showTeacherChatMessageStatus("يرجى كتابة الإجابة أولاً.");
        return;
    }

    if (message.length > 5000) {
        showTeacherChatMessageStatus(
            "الحد الأقصى لطول الرسالة هو 5000 حرف."
        );

        return;
    }

    state.isSendingTeacherChatMessage = true;
    renderTeacherChatConversationHeader();

    if (elements.sendTeacherChatMessageButton) {
        elements.sendTeacherChatMessageButton.textContent = "جارٍ الإرسال...";
    }

    try {
        await callTeacherChatHandler(
            "send_message",
            {
                room_id: room.id,
                message
            }
        );

        if (elements.teacherChatMessageInput) {
            elements.teacherChatMessageInput.value = "";
        }

        showTeacherChatMessageStatus(
            "تم إرسال الإجابة بنجاح.",
            "success"
        );

        await loadTeacherChatMessages(room.id);
        await loadTeacherChatRooms();

    } catch (error) {
        console.error("SEND TEACHER CHAT MESSAGE ERROR:", error);

        showTeacherChatMessageStatus(
            getErrorMessage(error, "تعذر إرسال الإجابة.")
        );

    } finally {
        state.isSendingTeacherChatMessage = false;

        if (elements.sendTeacherChatMessageButton) {
            elements.sendTeacherChatMessageButton.textContent = "إرسال الإجابة";
        }

        renderTeacherChatConversationHeader();
    }
}

/* =========================================================
   TEACHER CHAT — EVENTS
   ========================================================= */

function bindTeacherChatEvents() {
    elements.teacherChatClass?.addEventListener(
        "change",
        () => {
            updateTeacherChatSubjects();
            showTeacherChatActionMessage("");
        }
    );

    elements.teacherChatSubject?.addEventListener(
        "change",
        () => {
            updateTeacherChatOpenButton();
            showTeacherChatActionMessage("");
        }
    );

    elements.openTeacherChatRoomButton?.addEventListener(
        "click",
        openTeacherChatRoom
    );

    elements.refreshTeacherChatButton?.addEventListener(
        "click",
        () => loadTeacherChatRooms()
    );

    elements.teacherChatRoomsList?.addEventListener(
        "click",
        async event => {
            const button = event.target.closest(
                '[data-action="view-chat-room"]'
            );

            if (!button) return;

            const roomId = button.dataset.roomId;

            const room = state.teacherChatRooms.find(item =>
                String(item.id) === String(roomId)
            );

            if (!room) {
                showTeacherChatActionMessage(
                    "تعذر العثور على الغرفة المطلوبة."
                );

                return;
            }

            await selectTeacherChatRoom(room);
        }
    );

    elements.closeTeacherChatRoomButton?.addEventListener(
        "click",
        closeTeacherChatRoom
    );

    elements.teacherChatMessageForm?.addEventListener(
        "submit",
        sendTeacherChatMessage
    );

    elements.teacherChatMessageInput?.addEventListener(
        "input",
        () => {
            if (
                elements.teacherChatMessageInput.value.length > 5000
            ) {
                elements.teacherChatMessageInput.value =
                    elements.teacherChatMessageInput.value.slice(0, 5000);
            }
        }
    );
}

/* =========================================================
   SCHOOL ANNOUNCEMENTS
   ========================================================= */

function safeAnnouncementImageUrl(value) {
    if (!value) return "";

    try {
        const url = new URL(String(value), window.location.origin);

        if (!["https:", "http:"].includes(url.protocol)) {
            return "";
        }

        return url.href;
    } catch {
        return "";
    }
}

/*
 * حساب عدد الإعلانات غير المشاهدة.
 * حالة is_read تأتي من قاعدة البيانات عبر المعالج المستقل.
 */
function getUnreadAnnouncementCount() {
    return state.announcements.filter(announcement =>
        announcement.is_read !== true
    ).length;
}

/*
 * تحديث:
 * 1- عداد الإعلانات غير المشاهدة في الإحصائيات.
 * 2- الشارة الموجودة بجانب تبويب الإعلانات.
 */
function updateAnnouncementUnreadUI() {
    const unreadCount = getUnreadAnnouncementCount();

    if (elements.unreadAnnouncementCount) {
        elements.unreadAnnouncementCount.textContent =
            String(unreadCount);
    }

    if (elements.announcementBadge) {
        elements.announcementBadge.textContent =
            String(unreadCount);

        elements.announcementBadge.hidden =
            unreadCount === 0;
    }

    updateStatistics();
}

function getAnnouncementAttachments(announcement) {
    const attachments = Array.isArray(announcement.attachments)
        ? announcement.attachments
        : [];

    const result = [];

    attachments.forEach(attachment => {
        /*
         * المعالج الحالي يعيد url للمرفقات.
         * أضفنا signed_url كخيار احتياطي إذا كان موجوداً.
         */
        const rawUrl =
            attachment?.url ||
            attachment?.signed_url ||
            "";

        const url = safeAnnouncementImageUrl(rawUrl);

        if (url) {
            result.push({
                id: attachment.id,
                url,
                file_name: attachment.file_name || "مرفق من المدرسة"
            });
        }
    });

    const legacyImage = safeAnnouncementImageUrl(
        announcement.image_url
    );

    if (
        legacyImage &&
        !result.some(item => item.url === legacyImage)
    ) {
        result.push({
            id: null,
            url: legacyImage,
            file_name: "مرفق من المدرسة"
        });
    }

    return result;
}

function renderAnnouncementAttachments(announcement) {
    const attachments = getAnnouncementAttachments(announcement);

    if (!attachments.length) return "";

    return `
        <div class="homework-attachments announcement-attachments">
            ${attachments.map((attachment, index) => `
                <button
                    type="button"
                    class="homework-attachment announcement-image"
                    data-action="preview-announcement-image"
                    data-announcement-id="${escapeHTML(announcement.id)}"
                    data-image-url="${escapeHTML(attachment.url)}"
                    data-image-name="${escapeHTML(attachment.file_name)}"
                    title="عرض صورة الإعلان">

                    <img
                        src="${escapeHTML(attachment.url)}"
                        alt="${escapeHTML(attachment.file_name)}"
                        loading="lazy">

                    <span>
                        ${escapeHTML(attachment.file_name)}
                    </span>
                </button>
            `).join("")}
        </div>
    `;
}

function renderTeacherAnnouncement(announcement) {
    const createdAt = formatDateTime(announcement.created_at);
    const isRead = announcement.is_read === true;

    return `
        <article
            class="teacher-homework-card school-announcement-card ${isRead ? "read" : "unread"}"
            data-announcement-id="${escapeHTML(announcement.id)}"
            tabindex="0"
            role="button"
            aria-label="${isRead ? "إعلان تمت مشاهدته" : "إعلان جديد غير مشاهد"}">

            <div class="teacher-homework-header">

                <div class="teacher-homework-heading">
                    <span class="homework-type-label">
                        إعلان إدارة المدرسة
                    </span>

                    <h3>إعلان المدرسة</h3>

                    <p>
                        <span>تاريخ النشر:</span>
                        ${escapeHTML(createdAt)}
                    </p>

                    ${
                        isRead
                            ? `
                                <span class="announcement-read-label">
                                    ✓ تمت المشاهدة
                                </span>
                            `
                            : `
                                <span class="announcement-new">
                                    جديد
                                </span>
                            `
                    }
                </div>

            </div>

            ${announcement.content ? `
                <div class="teacher-homework-content">
                    ${escapeHTML(announcement.content).replace(/\n/g, "<br>")}
                </div>
            ` : ""}

            ${renderAnnouncementAttachments(announcement)}

            <div class="teacher-homework-footer">
                <span>
                    <strong>الجهة:</strong>
                    إدارة المدرسة
                </span>

                <span>
                    <strong>ينتهي في:</strong>
                    ${escapeHTML(formatDateTime(announcement.expires_at))}
                </span>
            </div>

        </article>
    `;
}

function renderTeacherAnnouncements() {
    if (!elements.announcementsList) {
        updateAnnouncementUnreadUI();
        return;
    }

    if (state.announcementsError) {
        showEmpty(
            elements.announcementsList,
            "تعذر تحميل إعلانات المدرسة",
            state.announcementsError
        );

        updateAnnouncementUnreadUI();
        return;
    }

    if (!state.announcements.length) {
        showEmpty(
            elements.announcementsList,
            "لا توجد إعلانات حالياً",
            "ستظهر هنا إعلانات إدارة المدرسة الموجهة للمعلمين."
        );

        updateAnnouncementUnreadUI();
        return;
    }

    elements.announcementsList.innerHTML =
        state.announcements.map(renderTeacherAnnouncement).join("");

    updateAnnouncementUnreadUI();
}

/*
 * تسجيل مشاهدة الإعلان في قاعدة البيانات.
 *
 * لا نغير حالة الإعلان محلياً إلا بعد نجاح mark_read.
 * لذلك تبقى حالة المشاهدة محفوظة عند تسجيل الخروج والدخول.
 */
async function markTeacherAnnouncementRead(announcementId) {
    const id = Number(announcementId);

    if (!Number.isSafeInteger(id) || id <= 0) {
        return false;
    }

    const announcement = state.announcements.find(item =>
        Number(item.id) === id
    );

    if (!announcement) {
        return false;
    }

    if (announcement.is_read === true) {
        return true;
    }

    if (state.pendingAnnouncementReads.has(id)) {
        return false;
    }

    state.pendingAnnouncementReads.add(id);

    try {
        const result = await callAnnouncementsHandler(
            "mark_read",
            {
                announcement_id: id
            }
        );

        if (result.is_read !== true) {
            throw new Error(
                result.message || "لم يتم تأكيد تسجيل مشاهدة الإعلان."
            );
        }

        announcement.is_read = true;

        renderTeacherAnnouncements();

        return true;

    } catch (error) {
        console.error(
            "MARK ANNOUNCEMENT AS READ ERROR:",
            {
                announcementId: id,
                error
            }
        );

        showPageMessage(
            "تعذر تسجيل مشاهدة الإعلان. حاول مرة أخرى.",
            "error"
        );

        return false;

    } finally {
        state.pendingAnnouncementReads.delete(id);
    }
}

async function loadTeacherAnnouncements() {
    if (!elements.announcementsList) {
        updateAnnouncementUnreadUI();
        return;
    }

    if (elements.refreshAnnouncementsButton) {
        elements.refreshAnnouncementsButton.disabled = true;
    }

    state.announcementsError = "";

    setLoading(
        elements.announcementsList,
        "جارٍ تحميل إعلانات إدارة المدرسة..."
    );

    try {
        // هذه الخدمة مستقلة تماماً عن homework-handler.
        // المعالج يعيد announcements مع is_read لكل إعلان.
        const result = await callAnnouncementsHandler(
            "teacher_announcements"
        );

        state.announcements = Array.isArray(result.announcements)
            ? result.announcements
            : [];

        renderTeacherAnnouncements();

    } catch (error) {
        console.error("LOAD TEACHER ANNOUNCEMENTS ERROR:", error);

        state.announcements = [];

        state.announcementsError = getErrorMessage(
            error,
            "تعذر تحميل إعلانات إدارة المدرسة."
        );

        renderTeacherAnnouncements();

    } finally {
        if (elements.refreshAnnouncementsButton) {
            elements.refreshAnnouncementsButton.disabled = false;
        }
    }
}

/*
 * الضغط على الإعلان:
 * - إذا ضغط المعلم على صورة، نفتح الصورة.
 * - نسجل مشاهدة الإعلان في الحالتين.
 * - لا نمنع فتح الصورة إذا تعذر تسجيل المشاهدة.
 */
async function handleTeacherAnnouncementsClick(event) {
    const imageButton = event.target.closest(
        '[data-action="preview-announcement-image"]'
    );

    const announcementCard = event.target.closest(
        "[data-announcement-id]"
    );

    if (!announcementCard) return;

    const announcementId =
        announcementCard.dataset.announcementId;

    if (imageButton) {
        openImageModal(
            imageButton.dataset.imageUrl,
            imageButton.dataset.imageName || "صورة الإعلان"
        );
    }

    await markTeacherAnnouncementRead(announcementId);
}

/*
 * دعم لوحة المفاتيح:
 * Enter أو Space يسجل مشاهدة الإعلان.
 */
function handleTeacherAnnouncementsKeydown(event) {
    if (
        event.key !== "Enter" &&
        event.key !== " "
    ) {
        return;
    }

    const card = event.target.closest(
        ".school-announcement-card[data-announcement-id]"
    );

    if (!card) return;

    // لا نتدخل في أزرار الصور أو أي عنصر تفاعلي داخل البطاقة.
    if (
        event.target.closest("button, a, input, select, textarea")
    ) {
        return;
    }

    event.preventDefault();

    markTeacherAnnouncementRead(
        card.dataset.announcementId
    );
}

function bindAnnouncementEvents() {
    elements.refreshAnnouncementsButton?.addEventListener(
        "click",
        loadTeacherAnnouncements
    );

    elements.announcementsList?.addEventListener(
        "click",
        handleTeacherAnnouncementsClick
    );

    elements.announcementsList?.addEventListener(
        "keydown",
        handleTeacherAnnouncementsKeydown
    );
}

/* =========================================================
   LOGOUT
   ========================================================= */

async function logoutTeacher() {
    if (!state.supabase) {
        window.location.replace("index.html");
        return;
    }

    if (elements.logoutButton) {
        elements.logoutButton.disabled = true;

        const label = elements.logoutButton.querySelector(
            "span:last-child"
        );

        if (label) {
            label.textContent = "جارٍ تسجيل الخروج...";
        }
    }

    const { error } = await state.supabase.auth.signOut();

    if (error) {
        console.error("LOGOUT ERROR:", error);

        showPageMessage(
            "تعذر تسجيل الخروج. حاول مرة أخرى.",
            "error"
        );

        if (elements.logoutButton) {
            elements.logoutButton.disabled = false;

            const label = elements.logoutButton.querySelector(
                "span:last-child"
            );

            if (label) {
                label.textContent = "تسجيل الخروج";
            }
        }

        return;
    }

    window.location.replace("index.html");
}

/* =========================================================
   INITIALIZATION
   ========================================================= */

async function initializeTeacherPage() {
    bindNavigation();
    bindScheduleEvents();
    bindAssignmentEvents();
    bindHomeworkForm();
    bindTeacherPostsEvents();
    bindModalEvents();
    bindAnnouncementEvents();
    bindTeacherChatEvents();

    elements.logoutButton?.addEventListener(
        "click",
        logoutTeacher
    );

    setText("currentDate", formatCurrentDate());

    state.supabase = getSupabaseClient();

    if (!state.supabase) {
        showPageMessage(
            "تعذر العثور على اتصال Supabase الخاص بالمعلم. تحقق من supabase-config.js.",
            "error"
        );

        showEmpty(
            elements.lessonList,
            "الاتصال غير متاح",
            "لم يتم العثور على window.supabaseClients.teacher."
        );

        showEmpty(
            elements.weeklyScheduleList,
            "الاتصال غير متاح",
            "لم يتم العثور على window.supabaseClients.teacher."
        );

        return;
    }

    try {
        const authenticated = await verifyTeacherSession();

        if (!authenticated) return;

        await loadSchoolInformation();

        renderProfile();

        await loadTeacherSchedule();

        // الواجبات تبقى مرتبطة بالمعالج القديم.
        await loadTeacherPosts();

        // إعلانات إدارة المدرسة تُحمّل من المعالج المستقل.
        await loadTeacherAnnouncements();

        // تحميل غرف الأسئلة من المعالج المستقل.
        populateTeacherChatOptions();

        // لا نحمّل غرف الأسئلة إلا عند فتح تبويبها.
        updateTeacherChatBadge();

    } catch (error) {
        console.error(
            "TEACHER PAGE INITIALIZATION ERROR:",
            error
        );

        showPageMessage(
            getErrorMessage(
                error,
                "تعذر تهيئة صفحة المعلم."
            ),
            "error"
        );
    }
}

document.addEventListener(
    "DOMContentLoaded",
    initializeTeacherPage
);
