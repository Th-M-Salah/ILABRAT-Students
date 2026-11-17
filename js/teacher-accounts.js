
"use strict";

/*
 * =========================================================
 * ILABRAT STUDENTS — TEACHER ACCOUNTS
 * File: js/teacher-accounts.js
 *
 * إدارة حسابات المعلمين وتكليفاتهم من Supabase.
 *
 * الوظائف:
 * - تحميل المعلمين المرتبطين بالمدرسة الحالية فقط.
 * - عرض اسم مدير المدرسة واسم المدرسة.
 * - البحث والتصفية حسب المادة والمرحلة.
 * - تصدير النتائج إلى Excel وCSV.
 * - إنشاء حساب معلم وتحديد تكليفاته.
 * - تعديل بيانات المعلم وتكليفاته.
 * - حذف حساب المعلم.
 * - استرجاع كود دخول المعلم.
 * - منع خلط بيانات المدارس المختلفة.
 * =========================================================
 */

(() => {
    "use strict";

    /* =====================================================
       1. المتغيرات الأساسية
       ===================================================== */

    const $ = (id) => document.getElementById(id);

    let teachers = [];
    let activeSchoolId = null;
    let activeSchoolName = "";
    let schoolClasses = [];

    let toastTimer = null;
    let removedEditAssignments = [];

    /* =====================================================
       2. أدوات عامة
       ===================================================== */

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[char]);
    }

    function setMessage(message, type = "info") {
        const element = $("pageMessage");

        if (!element) return;

        element.textContent = message || "";

        element.className = message
            ? `form-message show ${type}`
            : "form-message";
    }

    function showToast(message) {
        const toast = $("toast");

        if (!toast) return;

        toast.textContent = message;
        toast.classList.add("show");

        clearTimeout(toastTimer);

        toastTimer = setTimeout(() => {
            toast.classList.remove("show");
        }, 3000);
    }

    function unique(values) {
        return [
            ...new Set(
                values.filter(Boolean)
            )
        ];
    }

    function normalizeText(value) {
        return String(value || "")
            .trim()
            .replace(/\s+/g, " ");
    }

    function teacherSubjects(teacher) {
        return unique(
            teacher.assignments.map((item) => item.subject)
        );
    }

    function teacherStages(teacher) {
        return unique(
            teacher.assignments.map((item) => item.stage)
        );
    }

    function teacherSections(teacher) {
        return unique(
            teacher.assignments.map((item) => {
                return [
                    item.grade,
                    item.section
                        ? `شعبة ${item.section}`
                        : ""
                ].filter(Boolean).join(" — ");
            })
        );
    }

    /* =====================================================
       3. بيانات مدير المدرسة
       ===================================================== */

    function setAdminProfile(name) {
        const adminName = normalizeText(name) || "مدير المدرسة";

        const nameElement = $("adminDisplayName");
        const avatarElement = $("adminAvatar");
        const sidebarName = $("adminName");

        if (nameElement) {
            nameElement.textContent = adminName;
        }

        if (avatarElement) {
            avatarElement.textContent =
                adminName.charAt(0) || "إ";
        }

        if (sidebarName) {
            sidebarName.textContent = adminName;
        }
    }

    /* =====================================================
       4. الإحصائيات
       ===================================================== */

    function renderStats() {
        const totalTeachers = $("totalTeachers");
        const totalSubjects = $("totalSubjects");
        const totalClasses = $("totalClasses");

        if (totalTeachers) {
            totalTeachers.textContent =
                String(teachers.length);
        }

        if (totalSubjects) {
            totalSubjects.textContent = String(
                unique(
                    teachers.flatMap(teacherSubjects)
                ).length
            );
        }

        if (totalClasses) {
            totalClasses.textContent = String(
                unique(
                    teachers.flatMap((teacher) =>
                        teacher.assignments.map(
                            (item) => item.classKey
                        )
                    )
                ).length
            );
        }
    }

    /* =====================================================
       5. قائمة المواد
       ===================================================== */

    function updateSubjectFilter() {
        const filter = $("subjectFilter");

        if (!filter) return;

        const previous = filter.value;

        const values = unique(
            teachers.flatMap(teacherSubjects)
        ).sort((a, b) => a.localeCompare(b, "ar"));

        filter.innerHTML =
            '<option value="">جميع المواد</option>' +
            values.map((subject) => {
                return `
                    <option value="${escapeHTML(subject)}">
                        ${escapeHTML(subject)}
                    </option>
                `;
            }).join("");

        if (values.includes(previous)) {
            filter.value = previous;
        }
    }

    /* =====================================================
       6. البحث والتصفية
       ===================================================== */

    function getFilteredTeachers() {
        const query = $("teacherSearch")
            ?.value
            .trim()
            .toLocaleLowerCase("ar") || "";

        const subject = $("subjectFilter")?.value || "";
        const stage = $("stageFilter")?.value || "";

        return teachers.filter((teacher) => {
            const searchable = [
                teacher.name,
                ...teacherSubjects(teacher),
                ...teacherStages(teacher),
                ...teacherSections(teacher)
            ].join(" ").toLocaleLowerCase("ar");

            const matchesQuery =
                !query || searchable.includes(query);

            const matchesSubject =
                !subject ||
                teacher.assignments.some(
                    (item) => item.subject === subject
                );

            const matchesStage =
                !stage ||
                teacher.assignments.some(
                    (item) => item.stage === stage
                );

            return (
                matchesQuery &&
                matchesSubject &&
                matchesStage
            );
        });
    }

    /* =====================================================
       7. حالة عدم وجود نتائج
       ===================================================== */

    function renderEmpty(message, description = "") {
        const body = $("teachersTableBody");

        if (!body) return;

        body.innerHTML = `
            <tr>
                <td colspan="6" class="empty-state">
                    <div class="empty-icon">♙</div>

                    <strong>
                        ${escapeHTML(message)}
                    </strong>

                    ${
                        description
                            ? `<p>${escapeHTML(description)}</p>`
                            : ""
                    }
                </td>
            </tr>
        `;
    }

    /* =====================================================
       8. عرض المعلمين
       ===================================================== */

    function renderTeachers() {
        const body = $("teachersTableBody");

        if (!body) return;

        updateSubjectFilter();

        const filtered = getFilteredTeachers();

        const resultsCount = $("resultsCount");

        if (resultsCount) {
            resultsCount.textContent =
                `عدد المعلمين: ${filtered.length} من ${teachers.length}`;
        }

        renderStats();

        if (!filtered.length) {
            renderEmpty(
                teachers.length
                    ? "لا توجد نتائج مطابقة للبحث"
                    : "لا توجد حسابات معلمين مرتبطة بهذه المدرسة",

                teachers.length
                    ? "جرّب تغيير كلمات البحث أو خيارات التصفية."
                    : "ستظهر هنا الحسابات المرتبطة بمدرستك."
            );

            return;
        }

        body.innerHTML = filtered.map((teacher) => {
            const subjects = teacherSubjects(teacher);
            const stages = teacherStages(teacher);
            const sections = teacherSections(teacher);

            return `
                <tr>

                    <td>
                        <div class="teacher-cell">

                            <div class="teacher-avatar">
                                ${escapeHTML(
                                    (teacher.name || "م")
                                        .trim()
                                        .charAt(0)
                                )}
                            </div>

                            <div>
                                <strong>
                                    ${escapeHTML(teacher.name)}
                                </strong>

                                <small>
                                    ${
                                        teacher.phone
                                            ? `الهاتف: ${escapeHTML(teacher.phone)}`
                                            : "حساب معلم في إيلابرات"
                                    }
                                </small>
                            </div>

                        </div>
                    </td>

                    <td>
                        <div class="subject-tags">
                            ${
                                subjects.map((value) => `
                                    <span class="subject-tag">
                                        ${escapeHTML(value)}
                                    </span>
                                `).join("") || "—"
                            }
                        </div>
                    </td>

                    <td>
                        <div class="subject-tags">
                            ${
                                stages.map((value) => `
                                    <span class="stage-label">
                                        ${escapeHTML(value)}
                                    </span>
                                `).join("") || "—"
                            }
                        </div>
                    </td>

                    <td>
                        <div class="section-tags">
                            ${
                                sections.map((value) => `
                                    <span class="section-tag">
                                        ${escapeHTML(value)}
                                    </span>
                                `).join("") || "لم تُسند شعبة"
                            }
                        </div>
                    </td>

                    <td>
                        <span class="status-label">
                            مسجل
                        </span>

                        <div class="teacher-code-actions">
                            <button
                                type="button"
                                class="secondary-button teacher-action-code"
                                data-teacher-action="code"
                                data-teacher-id="${escapeHTML(teacher.id)}">

                                عرض / نسخ الكود

                            </button>
                        </div>
                    </td>

                    <td>
                        <div class="teacher-actions">

                            <button
                                type="button"
                                class="secondary-button teacher-action-edit"
                                data-teacher-action="edit"
                                data-teacher-id="${escapeHTML(teacher.id)}">

                                تعديل

                            </button>

                            <button
                                type="button"
                                class="danger-button teacher-action-delete"
                                data-teacher-action="delete"
                                data-teacher-id="${escapeHTML(teacher.id)}">

                                حذف

                            </button>

                        </div>
                    </td>

                </tr>
            `;
        }).join("");
    }

    /* =====================================================
       9. رسائل الأخطاء
       ===================================================== */

    function friendlyError(error) {
        const message = String(error?.message || "");

        if (
            /permission denied|row-level security|42501/i.test(message)
        ) {
            return "رفضت صلاحيات قاعدة البيانات قراءة بعض البيانات. لم نغيّر الصلاحيات تلقائيًا.";
        }

        if (
            /Failed to fetch|NetworkError|fetch|timeout|timed out/i.test(message)
        ) {
            return "تعذر الاتصال بـ Supabase حاليًا. أعد المحاولة لاحقًا.";
        }

        return message ||
            "حدث خطأ غير متوقع أثناء تنفيذ العملية.";
    }

    /* =====================================================
       10. تحميل بيانات المدرسة والمعلمين
       ===================================================== */

    async function loadTeachers() {
        const client = window.supabaseClient;

        if (!client) {
            setMessage(
                "لم يتم العثور على اتصال Supabase. تحقق من تحميل supabase-config.js بعد مكتبة Supabase.",
                "error"
            );

            renderEmpty("تعذر الاتصال بقاعدة البيانات");

            return;
        }

        const refreshButton = $("refreshTeachers");

        if (refreshButton) {
            refreshButton.disabled = true;
            refreshButton.textContent = "جارٍ التحديث...";
        }

        setMessage(
            "جارٍ تحميل حسابات المعلمين...",
            "info"
        );

        try {
            /* التحقق من المستخدم الحالي */

            const {
                data: userData,
                error: userError
            } = await client.auth.getUser();

            if (userError) throw userError;

            const user = userData?.user;

            if (!user) {
                setMessage(
                    "انتهت جلسة الدخول أو لم يتم تسجيل الدخول. سجّل الدخول بحساب مدير المدرسة ثم افتح الصفحة مجددًا.",
                    "error"
                );

                renderEmpty("يلزم تسجيل الدخول");

                return;
            }

            /* جلب اسم مدير المدرسة */

            const {
                data: adminProfile,
                error: adminProfileError
            } = await client
                .from("profiles")
                .select("full_name")
                .eq("id", user.id)
                .maybeSingle();

            if (adminProfileError) {
                throw adminProfileError;
            }

            setAdminProfile(adminProfile?.full_name);

            /* التحقق من عضوية مدير المدرسة */

            const {
                data: adminMemberships,
                error: adminMembershipError
            } = await client
                .from("school_memberships")
                .select("school_id, role")
                .eq("profile_id", user.id)
                .eq("role", "school_admin");

            if (adminMembershipError) {
                throw adminMembershipError;
            }

            if (!adminMemberships?.length) {
                setMessage(
                    "هذا الحساب ليس مرتبطًا بدور مدير المدرسة. افتح الصفحة بحساب مدير المدرسة.",
                    "error"
                );

                renderEmpty("لا توجد عضوية مدير مدرسة");

                return;
            }

            if (adminMemberships.length !== 1) {
                setMessage(
                    "هذا الحساب مرتبط بأكثر من مدرسة أو أن العضويات مكررة. أوقفنا التحميل لتجنب خلط البيانات.",
                    "error"
                );

                renderEmpty("تعذر تحديد المدرسة");

                return;
            }

            activeSchoolId = adminMemberships[0].school_id;

            /* جلب المدرسة الحالية */

            const {
                data: school,
                error: schoolError
            } = await client
                .from("schools")
                .select("id, name")
                .eq("id", activeSchoolId)
                .maybeSingle();

            if (schoolError) throw schoolError;

            activeSchoolName = school?.name || "";

            const schoolNameElement = $("schoolName");

            if (schoolNameElement) {
                schoolNameElement.textContent =
                    activeSchoolName || "مدرستي";
            }

            /* جلب شعب المدرسة الحالية */

            const {
                data: schoolClassRows,
                error: schoolClassesError
            } = await client
                .from("classes")
                .select(`
                    id,
                    school_id,
                    stage,
                    grade_name,
                    gender,
                    section_name,
                    name
                `)
                .eq("school_id", activeSchoolId);

            if (schoolClassesError) {
                throw schoolClassesError;
            }

            schoolClasses = schoolClassRows || [];

            /* جلب عضويات المعلمين للمدرسة الحالية */

            const {
                data: teacherMemberships,
                error: teacherMembershipError
            } = await client
                .from("school_memberships")
                .select("profile_id")
                .eq("school_id", activeSchoolId)
                .eq("role", "teacher");

            if (teacherMembershipError) {
                throw teacherMembershipError;
            }

            const teacherIds = unique(
                (teacherMemberships || [])
                    .map((item) => item.profile_id)
                    .filter(Boolean)
                    .map(String)
            );

            if (!teacherIds.length) {
                teachers = [];

                renderTeachers();

                setMessage(
                    `لا توجد عضويات معلمين مسجلة في مدرسة ${school?.name || "مدرستك"} حتى الآن.`,
                    "success"
                );

                return;
            }

            /* جلب ملفات المعلمين */

            const {
                data: profileRows,
                error: profilesError
            } = await client
                .from("profiles")
                .select(`
                    id,
                    full_name,
                    phone,
                    role,
                    created_at
                `)
                .in("id", teacherIds)
                .eq("role", "teacher")
                .order("created_at", {
                    ascending: false
                });

            if (profilesError) {
                throw profilesError;
            }

            /* جلب تكليفات المدرسة الحالية فقط */

            const {
                data: assignments,
                error: assignmentsError
            } = await client
                .from("teacher_assignments")
                .select(`
                    teacher_profile_id,
                    school_id,
                    class_id,
                    subject
                `)
                .eq("school_id", activeSchoolId)
                .in("teacher_profile_id", teacherIds);

            if (assignmentsError) {
                throw assignmentsError;
            }

            /* تجهيز بيانات الشعب */

            const classMap = new Map(
                schoolClasses.map((item) => [
                    String(item.id),
                    item
                ])
            );

            const assignmentMap = new Map();

            for (const item of (assignments || [])) {
                const key = String(item.teacher_profile_id);

                const schoolClass = classMap.get(
                    String(item.class_id)
                );

                if (!assignmentMap.has(key)) {
                    assignmentMap.set(key, []);
                }

                assignmentMap.get(key).push({
                    classId: item.class_id,

                    subject:
                        item.subject || "غير محددة",

                    stage:
                        schoolClass?.stage || "",

                    grade:
                        schoolClass?.grade_name ||
                        schoolClass?.name ||
                        "",

                    section:
                        schoolClass?.section_name || "",

                    gender:
                        schoolClass?.gender || "",

                    classKey: [
                        schoolClass?.stage || "",
                        schoolClass?.grade_name ||
                            schoolClass?.name || "",
                        schoolClass?.section_name || ""
                    ].join("|")
                });
            }

            /* تجهيز القائمة النهائية */

            teachers = (profileRows || [])
                .filter((profile) =>
                    teacherIds.includes(String(profile.id))
                )
                .map((profile) => ({
                    id: profile.id,

                    name:
                        profile.full_name ||
                        "اسم غير متوفر",

                    phone:
                        profile.phone || "",

                    createdAt:
                        profile.created_at,

                    assignments:
                        assignmentMap.get(
                            String(profile.id)
                        ) || []
                }));

            renderTeachers();

            setMessage(
                `تم تحميل بيانات ${teachers.length} معلم من مدرسة ${school?.name || "مدرستك"}.`,
                "success"
            );

        } catch (error) {
            console.error(
                "Teacher accounts load failed:",
                error
            );

            setMessage(
                friendlyError(error),
                "error"
            );

            renderEmpty(
                "تعذر تحميل حسابات المعلمين",
                "أعد المحاولة لاحقًا. إذا استمر الخطأ فسنراجع تفاصيله قبل تغيير الصلاحيات."
            );

        } finally {
            if (refreshButton) {
                refreshButton.disabled = false;

                refreshButton.innerHTML =
                    "<span>↻</span> تحديث القائمة";
            }
        }
    }

    /* =====================================================
       11. تصدير البيانات
       ===================================================== */

    function getTeacherExportRows() {
        return getFilteredTeachers().map((teacher) => ({
            "اسم المعلم": teacher.name,

            "رقم الهاتف":
                teacher.phone || "غير مسجل",

            "المواد الدراسية":
                teacherSubjects(teacher).join("، ") || "—",

            "المراحل":
                teacherStages(teacher).join("، ") || "—",

            "الشُعب المسندة":
                teacherSections(teacher).join("، ") || "—",

            "حالة الحساب":
                "مسجل",

            "المدرسة":
                activeSchoolName
        }));
    }

    function getExportFileName(extension) {
        const date = new Date()
            .toISOString()
            .slice(0, 10);

        return `حسابات-المعلمين-${date}.${extension}`;
    }

    /* =====================================================
       12. تصدير Excel
       ===================================================== */

    function exportTeachersExcel() {
        const rows = getTeacherExportRows();

        if (!rows.length) {
            showToast("لا توجد بيانات مطابقة للتصدير.");
            return;
        }

        if (!window.XLSX) {
            showToast(
                "مكتبة Excel غير متاحة. تحقق من تحميل مكتبة XLSX."
            );

            return;
        }

        const worksheet = window.XLSX.utils.json_to_sheet(rows);

        worksheet["!views"] = [
            { rightToLeft: true }
        ];

        worksheet["!cols"] = [
            { wch: 28 },
            { wch: 18 },
            { wch: 30 },
            { wch: 18 },
            { wch: 38 },
            { wch: 16 },
            { wch: 25 }
        ];

        const workbook =
            window.XLSX.utils.book_new();

        window.XLSX.utils.book_append_sheet(
            workbook,
            worksheet,
            "حسابات المعلمين"
        );

        window.XLSX.writeFile(
            workbook,
            getExportFileName("xlsx")
        );

        showToast(
            `تم تصدير ${rows.length} معلم إلى Excel.`
        );
    }

    /* =====================================================
       13. تصدير CSV
       ===================================================== */

    function exportTeachersCSV() {
        const rows = getTeacherExportRows();

        if (!rows.length) {
            showToast("لا توجد بيانات مطابقة للتصدير.");
            return;
        }

        const headers = Object.keys(rows[0]);

        function csvValue(value) {
            let text = String(value ?? "");

            // حماية CSV من تفسير النصوص كمعادلات.
            if (/^[=+\-@\t\r]/.test(text)) {
                text = "'" + text;
            }

            return `"${text.replace(/"/g, '""')}"`;
        }

        const lines = [
            headers.map(csvValue).join(","),

            ...rows.map((row) =>
                headers.map((header) =>
                    csvValue(row[header])
                ).join(",")
            )
        ];

        const csvContent =
            "\uFEFF" + lines.join("\r\n");

        const blob = new Blob(
            [csvContent],
            {
                type: "text/csv;charset=utf-8;"
            }
        );

        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");

        link.href = url;
        link.download = getExportFileName("csv");

        document.body.appendChild(link);

        link.click();

        link.remove();

        setTimeout(() => {
            URL.revokeObjectURL(url);
        }, 1000);

        showToast(
            `تم تصدير ${rows.length} معلم إلى CSV.`
        );
    }

    /* =====================================================
       14. القائمة المنسدلة للتصدير
       ===================================================== */

    function closeExportMenu() {
        const menu = $("exportMenu");
        const toggle = $("exportMenuToggle");

        if (!menu || !toggle) return;

        menu.hidden = true;

        toggle.setAttribute(
            "aria-expanded",
            "false"
        );
    }

    function initExportMenu() {
        const toggle = $("exportMenuToggle");
        const menu = $("exportMenu");
        const dropdown = $("exportDropdown");

        if (!toggle || !menu || !dropdown) {
            return;
        }

        toggle.addEventListener("click", (event) => {
            event.stopPropagation();

            const isOpen = !menu.hidden;

            menu.hidden = isOpen;

            toggle.setAttribute(
                "aria-expanded",
                String(!isOpen)
            );
        });

        $("exportExcel")?.addEventListener(
            "click",
            () => {
                closeExportMenu();
                exportTeachersExcel();
            }
        );

        $("exportCSV")?.addEventListener(
            "click",
            () => {
                closeExportMenu();
                exportTeachersCSV();
            }
        );

        document.addEventListener("click", (event) => {
            if (!dropdown.contains(event.target)) {
                closeExportMenu();
            }
        });

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                closeExportMenu();
            }
        });
    }

    /* =====================================================
       15. النوافذ المنبثقة
       ===================================================== */

    function setModalStatus(
        elementId,
        message,
        type = "info"
    ) {
        const element = $(elementId);

        if (!element) return;

        element.textContent = message || "";

        element.className = message
            ? `modal-status show ${type}`
            : "modal-status";
    }

    function openModal(modalId) {
        if (window.ILABRATTeacherModals?.open) {
            window.ILABRATTeacherModals.open(modalId);
            return;
        }

        const modal = $(modalId);

        if (!modal) {
            console.warn(
                `Modal not found: ${modalId}`
            );
            return;
        }

        modal.classList.add("is-open");

        modal.setAttribute(
            "aria-hidden",
            "false"
        );

        document.body.classList.add("modal-open");
    }

    function closeModal(modalId) {
        if (window.ILABRATTeacherModals?.close) {
            window.ILABRATTeacherModals.close(modalId);
            return;
        }

        const modal = $(modalId);

        if (!modal) return;

        modal.classList.remove("is-open");

        modal.setAttribute(
            "aria-hidden",
            "true"
        );

        const openModals = document.querySelectorAll(
            ".modal-overlay.is-open"
        );

        if (!openModals.length) {
            document.body.classList.remove("modal-open");
        }
    }

    function findTeacher(id) {
        return teachers.find(
            (teacher) =>
                String(teacher.id) === String(id)
        );
    }

    /* =====================================================
       16. الاتصال بوظائف المعلم
       ===================================================== */

    async function invokeTeacherAction(action, payload) {
        const client = window.supabaseClient;

        if (!client) {
            throw new Error(
                "اتصال Supabase غير متاح."
            );
        }

        const {
            data,
            error
        } = await client.functions.invoke(
            "teacher-handler",
            {
                body: {
                    action,
                    ...payload
                }
            }
        );

        if (error) {
            let detail =
                error.message ||
                "تعذر تنفيذ العملية على الخادم.";

            try {
                if (
                    error.context &&
                    typeof error.context.json === "function"
                ) {
                    const responseBody =
                        await error.context.json();

                    if (responseBody?.error) {
                        detail = responseBody.error;
                    }
                }
            } catch (_) {
                // الإبقاء على رسالة الخطأ الأصلية.
            }

            throw new Error(detail);
        }

        if (!data?.success) {
            throw new Error(
                data?.error || "لم تكتمل العملية."
            );
        }

        return data;
    }

    /* =====================================================
       17. تنسيق أسماء الشعب
       ===================================================== */

    function classLabel(item) {
        return [
            item.stage,
            item.grade_name || item.name,
            item.gender,
            item.section_name
                ? `شعبة ${item.section_name}`
                : ""
        ].filter(Boolean).join(" — ");
    }

    /* =====================================================
       18. محرر تكليفات المعلم
       ===================================================== */

   
function ensureEditAssignmentEditor() {
    const form = $("editTeacherForm");

    if (!form) {
        throw new Error(
            "لم يتم العثور على نموذج تعديل المعلم."
        );
    }

    let section = $("editTeacherAssignmentsSection");

    if (section) {
        return section;
    }

    section = document.createElement("section");

    section.id = "editTeacherAssignmentsSection";
    section.className = "edit-teacher-assignments";

    section.style.cssText = `
        margin:18px 0;
        padding:16px;
        border:1px solid #e6d9d5;
        border-radius:12px;
        background:#fffdfb;
    `;

    section.innerHTML = `
        <div style="
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:12px;
            flex-wrap:wrap;
            margin-bottom:12px;
        ">
            <strong>تكليفات المعلم</strong>

            <button
                type="button"
                class="secondary-button"
                id="addEditTeacherAssignmentButton">
                + إضافة تكليف
            </button>
        </div>

        <div id="editTeacherAssignmentsContainer"></div>
    `;

    const status = $("editTeacherStatusMessage");

    // البحث عن أول عنصر أب مباشر للفورم يحتوي رسالة الحالة.
    let anchor = status;

    while (anchor && anchor.parentElement !== form) {
        anchor = anchor.parentElement;
    }

    // الإدراج قبل الحاوية الصحيحة، أو الإضافة في نهاية الفورم.
    if (anchor && anchor.parentElement === form) {
        form.insertBefore(section, anchor);
    } else {
        form.appendChild(section);
    }

    $("addEditTeacherAssignmentButton")
        .addEventListener("click", () => {
            createEditAssignmentRow();
        });

    return section;
}


    function createEditAssignmentRow(
        classId = "",
        subject = "",
        isExisting = false
    ) {
        const container =
            $("editTeacherAssignmentsContainer");

        if (!container) return;

        const row = document.createElement("div");

        row.className =
            "teacher-assignment-row edit-teacher-assignment-row";

        row.dataset.existing = String(isExisting);

        row.dataset.originalClassId =
            String(classId);

        row.dataset.originalSubject = subject;

        row.style.cssText = `
            display:grid;
            grid-template-columns:1fr 1fr auto;
            gap:10px;
            align-items:end;
            margin-bottom:12px;
        `;

        const options = schoolClasses.map((item) => {
            const selected =
                String(item.id) === String(classId)
                    ? " selected"
                    : "";

            return `
                <option value="${escapeHTML(item.id)}"${selected}>
                    ${escapeHTML(classLabel(item))}
                </option>
            `;
        }).join("");

        row.innerHTML = `
            <div class="form-field">

                <label>الشعبة *</label>

                <select
                    class="edit-assignment-class"
                    required>

                    <option value="">
                        اختر الشعبة
                    </option>

                    ${options}

                </select>

            </div>

            <div class="form-field">

                <label>المادة *</label>

                <input
                    class="edit-assignment-subject"
                    type="text"
                    required
                    maxlength="150"
                    value="${escapeHTML(subject)}"
                    placeholder="مثال: الرياضيات">

            </div>

            <div class="form-field">

                <button
                    type="button"
                    class="secondary-button edit-assignment-remove">

                    إزالة

                </button>

            </div>
        `;

        row.querySelector(
            ".edit-assignment-remove"
        ).addEventListener("click", () => {
            if (row.dataset.existing === "true") {
                removedEditAssignments.push({
                    class_id: Number(
                        row.dataset.originalClassId
                    ),

                    subject:
                        row.dataset.originalSubject
                });
            }

            row.remove();
        });

        container.appendChild(row);
    }

    /* =====================================================
       19. فتح نافذة تعديل المعلم
       ===================================================== */

    function openEditTeacher(teacher) {
        const idInput = $("editTeacherId");
        const nameInput = $("editTeacherName");
        const phoneInput = $("editTeacherPhone");

        if (!idInput || !nameInput || !phoneInput) {
            showToast(
                "بعض حقول نموذج التعديل غير موجودة في الصفحة."
            );

            return;
        }

        idInput.value = teacher.id;

        nameInput.value =
            teacher.name === "اسم غير متوفر"
                ? ""
                : teacher.name;

        phoneInput.value = teacher.phone || "";

        try {
            ensureEditAssignmentEditor();

            removedEditAssignments = [];

            const container =
                $("editTeacherAssignmentsContainer");

            if (!container) {
                throw new Error(
                    "تعذر العثور على قائمة تكليفات المعلم."
                );
            }

            container.innerHTML = "";

            const currentAssignments =
                Array.isArray(teacher.assignments)
                    ? teacher.assignments
                    : [];

            if (currentAssignments.length) {
                currentAssignments.forEach((assignment) => {
                    createEditAssignmentRow(
                        assignment.classId,

                        assignment.subject === "غير محددة"
                            ? ""
                            : assignment.subject,

                        true
                    );
                });
            } else {
                createEditAssignmentRow();
            }

            setModalStatus(
                "editTeacherStatusMessage",

                "تم تحميل بيانات المعلم وتكليفاته الحالية. يمكنك إضافة تكليفات أو إزالة القديمة.",

                "info"
            );

            openModal("editTeacherModal");

        } catch (error) {
            console.error(
                "Could not prepare teacher edit form:",
                error
            );

            setModalStatus(
                "editTeacherStatusMessage",

                error.message ||
                    "تعذر تجهيز خانات التعديل.",

                "error"
            );

            openModal("editTeacherModal");
        }
    }

    /* =====================================================
       20. فتح نافذة حذف المعلم
       ===================================================== */

    function openDeleteTeacher(teacher) {
        const idInput = $("deleteTeacherId");
        const nameInput = $("deleteTeacherName");

        if (idInput) {
            idInput.value = teacher.id;
        }

        if (nameInput) {
            nameInput.value = teacher.name;
        }

        setModalStatus(
            "deleteTeacherStatus",
            "",
            "info"
        );

        openModal("deleteTeacherModal");
    }

    /* =====================================================
       21. إضافة صف تكليف جديد
       ===================================================== */

    function addAssignmentRow() {
        const container =
            $("teacherAssignmentsContainer");

        if (!container) return;

        const row = document.createElement("div");

        row.className =
            "teacher-assignment-row modal-form-grid";

        row.style.marginBottom = "10px";

        const options = schoolClasses.map((item) => {
            return `
                <option value="${escapeHTML(item.id)}">
                    ${escapeHTML(classLabel(item))}
                </option>
            `;
        }).join("");

        row.innerHTML = `
            <div class="form-field">

                <label>الشعبة *</label>

                <select
                    class="teacher-assignment-class"
                    required>

                    <option value="">
                        اختر الشعبة
                    </option>

                    ${options}

                </select>

            </div>

            <div class="form-field">

                <label>المادة *</label>

                <input
                    class="teacher-assignment-subject"
                    type="text"
                    required
                    maxlength="150"
                    placeholder="مثال: الرياضيات">

            </div>

            <div class="form-field full-width">

                <button
                    class="secondary-button teacher-assignment-remove"
                    type="button">

                    إزالة هذا التكليف

                </button>

            </div>
        `;

        row.querySelector(
            ".teacher-assignment-remove"
        ).addEventListener("click", () => {
            const rows = container.querySelectorAll(
                ".teacher-assignment-row"
            );

            if (rows.length <= 1) {
                row.querySelector(
                    ".teacher-assignment-class"
                ).value = "";

                row.querySelector(
                    ".teacher-assignment-subject"
                ).value = "";

                return;
            }

            row.remove();
        });

        container.appendChild(row);
    }

    /* =====================================================
       22. إنشاء حساب معلم
       ===================================================== */

    async function createTeacher(event) {
        event.preventDefault();

        const form = $("createTeacherForm");

        if (!form) return;

        const button = form.querySelector(
            'button[type="submit"]'
        );

        if (!button) return;

        const schoolInput =
            $("newTeacherSchoolName");

        const nameInput =
            $("newTeacherName");

        const phoneInput =
            $("newTeacherPhone");

        if (!schoolInput || !nameInput || !phoneInput) {
            setModalStatus(
                "createTeacherStatus",
                "بعض حقول إنشاء الحساب غير موجودة.",
                "error"
            );

            return;
        }

        const schoolName = normalizeText(
            schoolInput.value
        );

        const fullName = normalizeText(
            nameInput.value
        );

        const phone = phoneInput.value.trim();

        const assignmentRows = [
            ...document.querySelectorAll(
                "#teacherAssignmentsContainer .teacher-assignment-row"
            )
        ];

        const assignments = assignmentRows.map((row) => ({
            class_id: Number(
                row.querySelector(
                    ".teacher-assignment-class"
                )?.value
            ),

            subject: row.querySelector(
                ".teacher-assignment-subject"
            )?.value.trim() || ""
        }));

        if (!activeSchoolId || !activeSchoolName) {
            setModalStatus(
                "createTeacherStatus",

                "تعذر تحديد المدرسة المرتبطة بحسابك. حدّث الصفحة وحاول مجددًا.",

                "error"
            );

            return;
        }

        if (
            schoolName.toLocaleLowerCase("ar") !==
            normalizeText(activeSchoolName)
                .toLocaleLowerCase("ar")
        ) {
            setModalStatus(
                "createTeacherStatus",

                "اسم المدرسة لا يطابق المدرسة المرتبطة بحسابك. تحقق من الاسم وحاول مجددًا.",

                "error"
            );

            return;
        }

        if (
            fullName.split(" ").filter(Boolean).length < 4
        ) {
            setModalStatus(
                "createTeacherStatus",
                "أدخل الاسم الرباعي للمعلم.",
                "error"
            );

            return;
        }

        if (!phone || phone.length > 30) {
            setModalStatus(
                "createTeacherStatus",
                "أدخل رقم هاتف صحيحًا لا يتجاوز 30 حرفًا.",
                "error"
            );

            return;
        }

        if (
            !assignments.length ||
            assignments.some((item) =>
                !item.class_id ||
                !item.subject ||
                item.subject.length > 150
            )
        ) {
            setModalStatus(
                "createTeacherStatus",
                "أكمل اختيار الشعبة واسم المادة لكل تكليف.",
                "error"
            );

            return;
        }

        button.disabled = true;
        button.textContent = "جارٍ إنشاء الحساب...";

        setModalStatus(
            "createTeacherStatus",
            "جارٍ التحقق من المدرسة وإنشاء الحساب...",
            "info"
        );

        try {
            const data = await invokeTeacherAction(
                "create",
                {
                    school_id: activeSchoolId,
                    school_name: schoolName,
                    full_name: fullName,
                    phone,
                    assignments
                }
            );

            setModalStatus(
                "createTeacherStatus",

                `تم إنشاء الحساب بنجاح. كود الدخول: ${data.login_code || "غير متاح"} — احفظ الكود قبل إغلاق النافذة.`,

                "success"
            );

            showToast("تم إنشاء حساب المعلم.");

            await loadTeachers();

            form.reset();

            if ($("newTeacherSchoolName")) {
                $("newTeacherSchoolName").value =
                    activeSchoolName;
            }

            const container =
                $("teacherAssignmentsContainer");

            if (container) {
                container.innerHTML = "";
                addAssignmentRow();
            }

        } catch (error) {
            console.error(
                "Teacher creation failed:",
                error
            );

            setModalStatus(
                "createTeacherStatus",
                friendlyError(error),
                "error"
            );

        } finally {
            button.disabled = false;
            button.textContent = "إنشاء الحساب";
        }
    }

    /* =====================================================
       23. استرجاع كود دخول المعلم
       ===================================================== */

    async function retrieveTeacherCode(
        teacher,
        button
    ) {
        const originalText = button.textContent;

        button.disabled = true;
        button.textContent = "جارٍ الاسترجاع...";

        try {
            const data = await invokeTeacherAction(
                "get_code",
                {
                    teacher_id: teacher.id
                }
            );

            const code = String(
                data.login_code || ""
            ).trim();

            if (!code) {
                throw new Error(
                    "لم يُعثر على كود محفوظ لهذا الحساب. قد يكون الحساب أُنشئ قبل تفعيل حفظ الأكواد."
                );
            }

            let copied = false;

            try {
                await navigator.clipboard.writeText(code);
                copied = true;
            } catch (_) {
                // عرض الكود حتى إذا تعذر النسخ.
            }

            window.prompt(
                copied
                    ? "تم نسخ الكود. يمكنك الاحتفاظ بهذه النافذة للمراجعة:"
                    : "انسخ كود الدخول واحفظه بأمان:",

                code
            );

            showToast(
                copied
                    ? "تم استرجاع الكود ونسخه."
                    : "تم استرجاع الكود."
            );

        } catch (error) {
            console.error(
                "Teacher code retrieval failed:",
                error
            );

            showToast(
                friendlyError(error)
            );

        } finally {
            button.disabled = false;
            button.textContent = originalText;
        }
    }

    /* =====================================================
       24. حفظ تعديلات المعلم والتكليفات
       ===================================================== */

    async function saveTeacherEdits(event) {
        event.preventDefault();

        const form = $("editTeacherForm");

        if (!form) return;

        const button = form.querySelector(
            'button[type="submit"]'
        );

        if (!button) return;

        const teacherId =
            $("editTeacherId")?.value || "";

        const fullName = normalizeText(
            $("editTeacherName")?.value
        );

        const phone =
            $("editTeacherPhone")?.value.trim() || "";

        const rows = [
            ...document.querySelectorAll(
                "#editTeacherAssignmentsContainer .edit-teacher-assignment-row"
            )
        ];

        const assignments = [];

        const removedAssignments = [
            ...removedEditAssignments
        ];

        for (const row of rows) {
            const classId = Number(
                row.querySelector(
                    ".edit-assignment-class"
                )?.value
            );

            const subject = row.querySelector(
                ".edit-assignment-subject"
            )?.value.trim() || "";

            if (
                !classId ||
                !subject ||
                subject.length > 150
            ) {
                setModalStatus(
                    "editTeacherStatusMessage",
                    "أكمل اختيار الشعبة واسم المادة لكل تكليف.",
                    "error"
                );

                return;
            }

            const isExisting =
                row.dataset.existing === "true";

            const originalClassId = Number(
                row.dataset.originalClassId
            );

            const originalSubject =
                row.dataset.originalSubject || "";

            const unchanged =
                isExisting &&
                classId === originalClassId &&
                subject === originalSubject;

            if (unchanged) continue;

            if (isExisting) {
                removedAssignments.push({
                    class_id: originalClassId,
                    subject: originalSubject
                });
            }

            assignments.push({
                class_id: classId,
                subject
            });
        }

        if (
            !teacherId ||
            fullName.split(" ").filter(Boolean).length < 2
        ) {
            setModalStatus(
                "editTeacherStatusMessage",
                "أدخل اسم المعلم الكامل (كلمتين على الأقل).",
                "error"
            );

            return;
        }

        if (phone.length > 30) {
            setModalStatus(
                "editTeacherStatusMessage",
                "رقم الهاتف طويل جدًا.",
                "error"
            );

            return;
        }

        /* منع تكرار التكليفات الظاهرة */

        const visibleKeys = rows.map((row) => {
            const classId = Number(
                row.querySelector(
                    ".edit-assignment-class"
                )?.value
            );

            const subject = row.querySelector(
                ".edit-assignment-subject"
            )?.value.trim() || "";

            return (
                `${classId}|${subject.toLocaleLowerCase("ar")}`
            );
        });

        if (
            new Set(visibleKeys).size !==
            visibleKeys.length
        ) {
            setModalStatus(
                "editTeacherStatusMessage",
                "يوجد تكليف مكرر للشعبة والمادة نفسيهما.",
                "error"
            );

            return;
        }

        const teacher = findTeacher(teacherId);

        const existingKeys = new Set(
            (teacher?.assignments || [])
                .filter((item) => {
                    const isRemoved =
                        removedAssignments.some(
                            (removed) =>
                                Number(removed.class_id) ===
                                    Number(item.classId) &&

                                removed.subject === item.subject
                        );

                    return !isRemoved;
                })
                .map((item) => {
                    return (
                        `${Number(item.classId)}|` +
                        `${String(item.subject).toLocaleLowerCase("ar")}`
                    );
                })
        );

        const duplicateNewAssignment =
            assignments.some((item) => {
                const key =
                    `${Number(item.class_id)}|` +
                    `${item.subject.toLocaleLowerCase("ar")}`;

                return existingKeys.has(key);
            });

        if (duplicateNewAssignment) {
            setModalStatus(
                "editTeacherStatusMessage",
                "هذا التكليف موجود مسبقًا للمعلم. لا يمكن إضافته مرة أخرى.",
                "error"
            );

            return;
        }

        button.disabled = true;

        const originalText = button.textContent;

        button.textContent = "جارٍ الحفظ...";

        setModalStatus(
            "editTeacherStatusMessage",
            "جارٍ حفظ بيانات المعلم والتكليفات...",
            "info"
        );

        try {
            await invokeTeacherAction(
                "update",
                {
                    teacher_id: teacherId,
                    school_id: activeSchoolId,
                    full_name: fullName,
                    phone: phone || null,
                    assignments,
                    removed_assignments: removedAssignments
                }
            );

            removedEditAssignments = [];

            showToast(
                "تم إرسال تحديث بيانات المعلم وتكليفاته."
            );

            closeModal("editTeacherModal");

            await loadTeachers();

        } catch (error) {
            console.error(
                "Teacher update failed:",
                error
            );

            setModalStatus(
                "editTeacherStatusMessage",
                friendlyError(error),
                "error"
            );

        } finally {
            button.disabled = false;

            button.textContent =
                originalText || "حفظ التعديلات";
        }
    }

    /* =====================================================
       25. حذف حساب المعلم
       ===================================================== */

    async function deleteTeacher(event) {
        event.preventDefault();

        const form = $("deleteTeacherForm");

        if (!form) return;

        const button = form.querySelector(
            'button[type="submit"]'
        );

        if (!button) return;

        const teacherId =
            $("deleteTeacherId")?.value || "";

        if (!teacherId) {
            setModalStatus(
                "deleteTeacherStatus",
                "لم يتم تحديد حساب المعلم.",
                "error"
            );

            return;
        }

        button.disabled = true;
        button.textContent = "جارٍ الحذف...";

        setModalStatus(
            "deleteTeacherStatus",
            "جارٍ حذف الحساب وبياناته المرتبطة...",
            "info"
        );

        try {
            await invokeTeacherAction(
                "delete",
                {
                    teacher_id: teacherId,
                    school_id: activeSchoolId
                }
            );

            showToast("تم حذف حساب المعلم.");

            closeModal("deleteTeacherModal");

            await loadTeachers();

        } catch (error) {
            console.error(
                "Teacher deletion failed:",
                error
            );

            setModalStatus(
                "deleteTeacherStatus",
                friendlyError(error),
                "error"
            );

        } finally {
            button.disabled = false;
            button.textContent = "تأكيد الحذف";
        }
    }

    /* =====================================================
       26. إعادة ضبط البحث والتصفية
       ===================================================== */

    function clearFilters() {
        if ($("teacherSearch")) {
            $("teacherSearch").value = "";
        }

        if ($("subjectFilter")) {
            $("subjectFilter").value = "";
        }

        if ($("stageFilter")) {
            $("stageFilter").value = "";
        }

        renderTeachers();
    }

    /* =====================================================
       27. تسجيل الخروج
       ===================================================== */

    async function logout(event) {
        event.preventDefault();

        const client = window.supabaseClient;

        if (!client) {
            window.location.href = "index.html";
            return;
        }

        try {
            const { error } =
                await client.auth.signOut();

            if (error) {
                throw error;
            }

            window.location.href = "index.html";

        } catch (error) {
            console.error(
                "Sign out failed:",
                error
            );

            setMessage(
                "تعذر تسجيل الخروج. حاول مرة أخرى.",
                "error"
            );
        }
    }

    /* =====================================================
       28. فتح نافذة إنشاء معلم
       ===================================================== */

    function openCreateTeacher() {
        if (!activeSchoolId || !activeSchoolName) {
            showToast(
                "انتظر حتى يتم تحميل بيانات المدرسة."
            );

            return;
        }

        const form = $("createTeacherForm");

        if (form) {
            form.reset();
        }

        const schoolInput =
            $("newTeacherSchoolName");

        if (schoolInput) {
            schoolInput.value = activeSchoolName;
        }

        const container =
            $("teacherAssignmentsContainer");

        if (container) {
            container.innerHTML = "";
            addAssignmentRow();
        }

        setModalStatus(
            "createTeacherStatus",
            "",
            "info"
        );

        openModal("createTeacherModal");
    }

    /* =====================================================
       29. ربط أحداث جدول المعلمين
       ===================================================== */

    function initTeacherTableEvents() {
        const body = $("teachersTableBody");

        if (!body) return;

        body.addEventListener("click", (event) => {
            const button = event.target.closest(
                "[data-teacher-action]"
            );

            if (!button) return;

            const teacher = findTeacher(
                button.dataset.teacherId
            );

            if (!teacher) {
                showToast(
                    "تعذر العثور على بيانات المعلم. حدّث القائمة وحاول مجددًا."
                );

                return;
            }

            const action =
                button.dataset.teacherAction;

            if (action === "edit") {
                openEditTeacher(teacher);
                return;
            }

            if (action === "delete") {
                openDeleteTeacher(teacher);
                return;
            }

            if (action === "code") {
                retrieveTeacherCode(teacher, button);
            }
        });
    }

    /* =====================================================
       30. ربط أحداث النوافذ
       ===================================================== */

    function initModalEvents() {
        document.querySelectorAll(
            "[data-close-modal]"
        ).forEach((button) => {
            button.addEventListener("click", () => {
                const modal = button.closest(
                    ".modal-overlay"
                );

                if (modal?.id) {
                    closeModal(modal.id);
                }
            });
        });

        document.querySelectorAll(
            ".modal-overlay"
        ).forEach((modal) => {
            modal.addEventListener("click", (event) => {
                if (event.target === modal) {
                    closeModal(modal.id);
                }
            });
        });
    }

    /* =====================================================
       31. تهيئة الصفحة وربط الأحداث
       ===================================================== */

    function init() {
        // تحديث قائمة المعلمين
        $("refreshTeachers")?.addEventListener(
            "click",
            loadTeachers
        );

        // البحث
        $("teacherSearch")?.addEventListener(
            "input",
            renderTeachers
        );

        // تصفية المواد
        $("subjectFilter")?.addEventListener(
            "change",
            renderTeachers
        );

        // تصفية المراحل
        $("stageFilter")?.addEventListener(
            "change",
            renderTeachers
        );

        // مسح البحث
        $("clearSearch")?.addEventListener(
            "click",
            clearFilters
        );

        // تسجيل الخروج
        $("logoutLink")?.addEventListener(
            "click",
            logout
        );

        // قائمة التصدير
        initExportMenu();

        // أحداث جدول المعلمين
        initTeacherTableEvents();

        // زر إضافة معلم
        $("openCreateTeacherModal")?.addEventListener(
            "click",
            openCreateTeacher
        );

        // إنشاء حساب معلم
        $("createTeacherForm")?.addEventListener(
            "submit",
            createTeacher
        );

        // إضافة تكليف
        $("addTeacherAssignmentButton")?.addEventListener(
            "click",
            addAssignmentRow
        );

        // حفظ تعديلات المعلم
        $("editTeacherForm")?.addEventListener(
            "submit",
            saveTeacherEdits
        );

        // حذف حساب المعلم
        $("deleteTeacherForm")?.addEventListener(
            "submit",
            deleteTeacher
        );

        // أحداث النوافذ المنبثقة
        initModalEvents();

        // تحميل البيانات
        loadTeachers().then(() => {
            const container =
                $("teacherAssignmentsContainer");

            if (
                container &&
                !container.children.length &&
                activeSchoolId
            ) {
                addAssignmentRow();
            }
        });
    }

    /* =====================================================
       32. تشغيل الصفحة
       ===================================================== */

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            init,
            { once: true }
        );
    } else {
        init();
    }

})();
