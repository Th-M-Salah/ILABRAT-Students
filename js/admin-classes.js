
"use strict";

/* =========================================================
   ILABRAT — إدارة الشعب الدراسية
   إنشاء / عرض / بحث / تعديل / حذف آمن
   ========================================================= */

const db = window.supabaseClient || window.db;

const el = (id) => document.getElementById(id);

let currentUser = null;
let currentSchoolId = null;
let currentSchoolName = "";
let currentClasses = [];
let toastTimer = null;

document.addEventListener("DOMContentLoaded", initializePage);

async function initializePage() {
    bindEvents();

    if (!db) {
        showConnection("تعذر العثور على اتصال Supabase. تحقق من supabase-config.js.");
        return;
    }

    try {
        const { data: authData, error: authError } = await db.auth.getUser();

        if (authError || !authData?.user) {
            showConnection("انتهت جلسة الدخول. يرجى تسجيل الدخول مرة أخرى.");
            return;
        }

        currentUser = authData.user;

        const { data: profile, error: profileError } = await db
            .from("profiles")
            .select("id, full_name, role")
            .eq("id", currentUser.id)
            .maybeSingle();

        if (profileError) throw profileError;

        if (!profile || profile.role !== "school_admin") {
            showConnection("هذه الصفحة مخصصة لمدير المدرسة.");
            return;
        }

        el("adminDisplayName").textContent = profile.full_name || "مدير المدرسة";

        const { data: membership, error: membershipError } = await db
            .from("school_memberships")
            .select("school_id")
            .eq("profile_id", currentUser.id)
            .eq("role", "school_admin")
            .maybeSingle();

        if (membershipError) throw membershipError;

        if (!membership?.school_id) {
            showConnection("لم يتم العثور على ارتباط مدرستك في النظام.");
            return;
        }

        currentSchoolId = membership.school_id;

        const { data: school, error: schoolError } = await db
            .from("schools")
            .select("id, name")
            .eq("id", currentSchoolId)
            .maybeSingle();

        if (schoolError) throw schoolError;

        currentSchoolName = school?.name || "مدرستي";
        el("schoolDisplayName").textContent = currentSchoolName;

        showConnection("تم التحقق من صلاحياتك. يمكنك إدارة شعب مدرستك.");
        await loadClasses();

    } catch (error) {
        console.error("ILABRAT classes initialization:", error);
        showConnection(error.message || "حدث خطأ أثناء تحميل الصفحة.");
    }
}

function bindEvents() {
    el("addClassButton").addEventListener("click", openCreateModal);
    el("refreshButton").addEventListener("click", loadClasses);

    el("searchInput").addEventListener("input", renderClasses);
    el("filterStage").addEventListener("change", renderClasses);
    el("filterGender").addEventListener("change", renderClasses);

    el("closeModalButton").addEventListener("click", closeModal);
    el("cancelModalButton").addEventListener("click", closeModal);

    el("classModal").addEventListener("click", (event) => {
        if (event.target === el("classModal")) closeModal();
    });

    el("classForm").addEventListener("submit", handleClassSubmit);

    el("classesTableBody").addEventListener("click", (event) => {
        const button = event.target.closest("button[data-action]");
        if (!button) return;

        const id = Number(button.dataset.id);
        const record = currentClasses.find(item => Number(item.id) === id);

        if (!record) return;

        if (button.dataset.action === "edit") {
            openEditModal(record);
        } else if (button.dataset.action === "delete") {
            deleteClass(record);
        }
    });
}

async function loadClasses() {
    if (!currentSchoolId) return;

    setTableMessage("جارٍ تحميل الشعب...");

    try {
        const { data, error } = await db
            .from("classes")
            .select("id, name, school_id, stage, grade_name, gender, section_name")
            .eq("school_id", currentSchoolId)
            .order("stage", { ascending: true })
            .order("grade_name", { ascending: true })
            .order("section_name", { ascending: true });

        if (error) throw error;

        currentClasses = data || [];

        updateStatistics();
        populateStageFilter();
        renderClasses();

    } catch (error) {
        console.error("loadClasses:", error);
        setTableMessage(error.message || "تعذر تحميل الشعب.");
        showToast("حدث خطأ أثناء تحميل الشعب.");
    }
}

function updateStatistics() {
    const stages = new Set(
        currentClasses.map(item => item.stage).filter(Boolean)
    );

    el("totalClasses").textContent = currentClasses.length;
    el("totalStages").textContent = stages.size;
    el("lastUpdate").textContent = new Date().toLocaleDateString("ar-IQ");
}

function populateStageFilter() {
    const select = el("filterStage");
    const previous = select.value;

    select.innerHTML = '<option value="">كل المراحل</option>';

    const stages = [...new Set(
        currentClasses.map(item => item.stage).filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, "ar"));

    stages.forEach(stage => {
        const option = document.createElement("option");
        option.value = stage;
        option.textContent = stage;
        select.appendChild(option);
    });

    select.value = stages.includes(previous) ? previous : "";
}

function renderClasses() {
    const search = el("searchInput").value.trim().toLowerCase();
    const stage = el("filterStage").value;
    const gender = el("filterGender").value;

    const filtered = currentClasses.filter(item => {
        const text = [
            item.name,
            item.stage,
            item.grade_name,
            item.gender,
            item.section_name
        ].filter(Boolean).join(" ").toLowerCase();

        return (!search || text.includes(search)) &&
            (!stage || item.stage === stage) &&
            (!gender || item.gender === gender);
    });

    const tbody = el("classesTableBody");
    tbody.innerHTML = "";

    if (!filtered.length) {
        setTableMessage("لا توجد شعب مطابقة للبحث.");
        el("resultsCount").textContent = "0 شعبة";
        return;
    }

    filtered.forEach((item, index) => {
        const tr = document.createElement("tr");

        appendCell(tr, index + 1);
        appendCell(tr, item.stage || "—");
        appendCell(tr, item.grade_name || item.name || "—");
        appendCell(tr, item.gender || "—");
        appendCell(tr, item.section_name || "—");

        const actionsCell = document.createElement("td");
        const actions = document.createElement("div");
        actions.className = "row-actions";

        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "small-action edit-action";
        editButton.textContent = "تعديل";
        editButton.dataset.action = "edit";
        editButton.dataset.id = item.id;

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "small-action delete-action";
        deleteButton.textContent = "حذف";
        deleteButton.dataset.action = "delete";
        deleteButton.dataset.id = item.id;

        actions.append(editButton, deleteButton);
        actionsCell.appendChild(actions);
        tr.appendChild(actionsCell);

        tbody.appendChild(tr);
    });

    el("resultsCount").textContent = `${filtered.length} شعبة`;
}

function appendCell(row, value) {
    const td = document.createElement("td");
    td.textContent = String(value ?? "—");
    row.appendChild(td);
}

function setTableMessage(message) {
    const tbody = el("classesTableBody");
    tbody.innerHTML = "";

    const tr = document.createElement("tr");
    const td = document.createElement("td");

    td.colSpan = 6;
    td.className = "table-message";
    td.textContent = message;

    tr.appendChild(td);
    tbody.appendChild(tr);
}

function openCreateModal() {
    el("classForm").reset();
    el("classId").value = "";
    el("modalTitle").textContent = "إنشاء شعبة جديدة";
    el("saveClassButton").textContent = "حفظ الشعبة";
    el("formError").textContent = "";
    el("classModal").hidden = false;
}

function openEditModal(record) {
    el("classForm").reset();

    el("classId").value = record.id;
    el("stageInput").value = record.stage || "";
    el("gradeInput").value = record.grade_name || "";
    el("genderInput").value = record.gender || "";
    el("sectionInput").value = record.section_name || "";

    el("modalTitle").textContent = "تعديل بيانات الشعبة";
    el("saveClassButton").textContent = "حفظ التعديلات";
    el("formError").textContent = "";
    el("classModal").hidden = false;
}

function closeModal() {
    el("classModal").hidden = true;
    el("classForm").reset();
    el("formError").textContent = "";
}

async function handleClassSubmit(event) {
    event.preventDefault();

    if (!currentSchoolId) {
        showFormError("تعذر تحديد المدرسة.");
        return;
    }

    const id = el("classId").value;

    const stage = el("stageInput").value.trim();
    const gradeName = el("gradeInput").value.trim();
    const gender = el("genderInput").value;
    const sectionName = el("sectionInput").value.trim();

    if (!stage || !gradeName || !gender || !sectionName) {
        showFormError("يرجى إكمال جميع بيانات الشعبة.");
        return;
    }

    const duplicate = currentClasses.some(item =>
        String(item.id) !== String(id) &&
        item.stage === stage &&
        item.grade_name === gradeName &&
        item.gender === gender &&
        item.section_name?.trim().toLowerCase() === sectionName.toLowerCase()
    );

    if (duplicate) {
        showFormError("هذه الشعبة مسجلة مسبقاً في مدرستك.");
        return;
    }

    const saveButton = el("saveClassButton");
    saveButton.disabled = true;
    saveButton.textContent = "جارٍ الحفظ...";

    try {
        const payload = {
            name: `${gradeName} - ${gender} - ${sectionName}`,
            school_id: currentSchoolId,
            stage,
            grade_name: gradeName,
            gender,
            section_name: sectionName
        };

        let result;

        if (id) {
            result = await db
                .from("classes")
                .update(payload)
                .eq("id", Number(id))
                .eq("school_id", currentSchoolId);
        } else {
            result = await db
                .from("classes")
                .insert(payload);
        }

        if (result.error) throw result.error;

        closeModal();
        showToast(id ? "تم تعديل بيانات الشعبة." : "تم إنشاء الشعبة بنجاح.");
        await loadClasses();

    } catch (error) {
        console.error("save class:", error);
        showFormError(error.message || "تعذر حفظ الشعبة.");
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = id ? "حفظ التعديلات" : "حفظ الشعبة";
    }
}

async function deleteClass(record) {
    const confirmed = window.confirm(
        `هل تريد حذف الشعبة:\n${record.grade_name || record.name} - ${record.section_name}؟\n\nسيتم أولاً التحقق من عدم ارتباطها بطلاب أو حصص أو تعيينات معلمين.`
    );

    if (!confirmed) return;

    try {
        const dependencies = [
            { table: "students", column: "class_id", label: "طلاب" },
            { table: "timetable_lessons", column: "class_id", label: "حصص دراسية" },
            { table: "teacher_assignments", column: "class_id", label: "تعيينات معلمين" }
        ];

        for (const dependency of dependencies) {
            const { data, error } = await db
                .from(dependency.table)
                .select("id")
                .eq(dependency.column, record.id)
                .limit(1);

            if (error) throw error;

            if (data && data.length) {
                showToast(`لا يمكن حذف الشعبة: توجد بيانات مرتبطة بها (${dependency.label}).`);
                return;
            }
        }

        const { error: deleteError } = await db
            .from("classes")
            .delete()
            .eq("id", record.id)
            .eq("school_id", currentSchoolId);

        if (deleteError) throw deleteError;

        showToast("تم حذف الشعبة.");
        await loadClasses();

    } catch (error) {
        console.error("deleteClass:", error);
        showToast(error.message || "تعذر حذف الشعبة.");
    }
}

function showConnection(message) {
    el("connectionNotice").textContent = message;
}

function showFormError(message) {
    el("formError").textContent = message;
}

function showToast(message) {
    const toast = el("toastMessage");

    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 3500);
}
