
"use strict";

(() => {
  const db = window.supabaseClient || window.db;
  const $ = (id) => document.getElementById(id);

  const form = $("announcementForm");
  const contentInput = $("announcementContent");
  const audienceInput = $("audienceSelect");
  const classInput = $("classSelect");
  const imageInput = $("announcementImages");

  const newImagesPreview = $("newImagesPreview");
  const existingImagesPreview = $("existingImagesPreview");

  const submitBtn = $("saveAnnouncementBtn");
  const saveButtonText = $("saveButtonText");
  const cancelEditBtn = $("cancelEditBtn");

  const announcementsList = $("announcementsList");
  const deleteModal = $("deleteModal");
  const refreshBtn = $("refreshBtn");
  const confirmDeleteBtn = $("confirmDeleteBtn");
  const cancelDeleteBtn = $("cancelDeleteBtn");

  const adminDisplayName = $("adminDisplayName");
  const topbarAdminName = $("topbarAdminName");
  const adminAvatar = $("adminAvatar");
  const sidebarSchoolName = $("sidebarSchoolName");

  const pageAlert = $("pageAlert");
  const contentCounter = $("contentCounter");

  const totalAnnouncements = $("totalAnnouncements");
  const activeAnnouncements = $("activeAnnouncements");
  const expiredAnnouncements = $("expiredAnnouncements");

  const filterStatus = $("filterStatus");
  const filterAudience = $("filterAudience");

  let editingId = null;
  let pendingDeleteId = null;
  let announcements = [];
  let classes = [];
  let previewObjectUrl = null;

  const audienceNames = {
    students: "الطلاب",
    teachers: "المعلمون",
    both: "الطلاب والمعلمون",
  };

  const requiredElements = [
    ["announcementForm", form],
    ["announcementContent", contentInput],
    ["audienceSelect", audienceInput],
    ["classSelect", classInput],
    ["announcementImages", imageInput],
    ["newImagesPreview", newImagesPreview],
    ["existingImagesPreview", existingImagesPreview],
    ["saveAnnouncementBtn", submitBtn],
    ["saveButtonText", saveButtonText],
    ["cancelEditBtn", cancelEditBtn],
    ["announcementsList", announcementsList],
    ["deleteModal", deleteModal],
    ["refreshBtn", refreshBtn],
    ["confirmDeleteBtn", confirmDeleteBtn],
    ["cancelDeleteBtn", cancelDeleteBtn],
  ];

  const missingElements = requiredElements
    .filter(([, element]) => !element)
    .map(([id]) => id);

  if (missingElements.length) {
    console.error(
      "ILABRAT: عناصر HTML غير موجودة:",
      missingElements.join(", ")
    );
    return;
  }

  // إنشاء نافذة تكبير الصور تلقائياً دون تعديل HTML
  function createImageViewer() {
    if ($("announcementImageViewer")) return;

    const viewer = document.createElement("div");

    viewer.id = "announcementImageViewer";
    viewer.className = "image-viewer";
    viewer.hidden = true;

    viewer.innerHTML = `
      <div class="image-viewer-content" role="dialog"
           aria-modal="true" aria-label="عرض صورة الإعلان">

        <button type="button" class="image-viewer-close"
                aria-label="إغلاق الصورة">
          &times;
        </button>

        <img src="" alt="صورة الإعلان المكبرة"
             class="image-viewer-photo">

      </div>
    `;

    document.body.appendChild(viewer);

    const closeButton = viewer.querySelector(".image-viewer-close");

    function closeViewer() {
      viewer.hidden = true;
      document.body.classList.remove("image-viewer-open");

      const image = viewer.querySelector("img");
      image.removeAttribute("src");
    }

    closeButton.addEventListener("click", closeViewer);

    viewer.addEventListener("click", (event) => {
      if (event.target === viewer) {
        closeViewer();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !viewer.hidden) {
        closeViewer();
      }
    });
  }

  function openImageViewer(url, alt = "صورة الإعلان") {
    if (!url) return;

    createImageViewer();

    const viewer = $("announcementImageViewer");
    const image = viewer.querySelector("img");

    image.src = url;
    image.alt = alt;

    viewer.hidden = false;
    document.body.classList.add("image-viewer-open");
  }

  createImageViewer();

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    })[char]);
  }

  function formatDate(value) {
    if (!value) return "غير محدد";

    return new Date(value).toLocaleString("ar-IQ", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function showMessage(message, type = "info") {
    if (!pageAlert) return;

    pageAlert.textContent = message;
    pageAlert.className = `page-alert ${type}`;
    pageAlert.hidden = !message;

    if (message) {
      pageAlert.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }

  function setButtonLoading(loading, text = "") {
    submitBtn.disabled = loading;

    if (text) {
      saveButtonText.textContent = text;
    }
  }

  async function invoke(action, body = null) {
    if (!db?.functions) {
      throw new Error("لم يتم العثور على اتصال Supabase.");
    }

    const options = {};

    if (body instanceof FormData) {
      if (!body.has("action")) {
        body.append("action", action);
      }

      options.body = body;
    } else {
      options.body = {
        ...(body && typeof body === "object" ? body : {}),
        action,
      };
    }

    const { data, error } = await db.functions.invoke(
      "school-announcements-handler",
      options
    );

    if (error) {
      let message = error.message || "تعذر تنفيذ الطلب.";

      if (error.context && typeof error.context.json === "function") {
        try {
          const details = await error.context.json();

          if (details?.message || details?.error) {
            message = details.message || details.error;
          }
        } catch (_) {}
      }

      throw new Error(message);
    }

    if (!data?.success) {
      throw new Error(
        data?.message || data?.error || "تعذر تنفيذ الطلب."
      );
    }

    return data;
  }

  async function loadAdminInfo() {
    try {
      const { data: sessionData, error: sessionError } =
        await db.auth.getSession();

      if (sessionError) throw sessionError;

      const user = sessionData?.session?.user;

      if (!user) {
        window.location.href = "index.html";
        return;
      }

      const { data, error } = await db
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();

      if (error) throw error;

      const name = data?.full_name || "مدير المدرسة";

      if (adminDisplayName) adminDisplayName.textContent = name;
      if (topbarAdminName) topbarAdminName.textContent = name;

      if (adminAvatar) {
        adminAvatar.textContent = name.trim().charAt(0) || "م";
      }
    } catch (error) {
      console.warn("تعذر تحميل بيانات المدير:", error);
    }
  }

  async function loadClasses() {
    const result = await invoke("admin_data");

    classes = result.classes || [];
    announcements = result.announcements || [];

    classInput.innerHTML =
      '<option value="">جميع شعب المدرسة</option>';

    for (const item of classes) {
      const option = document.createElement("option");

      option.value = item.id;

      const parts = [
        item.stage,
        item.grade_name,
        item.gender,
        item.section_name,
      ].filter(Boolean);

      option.textContent = parts.length
        ? parts.join(" - ")
        : item.name || `الشعبة ${item.id}`;

      classInput.appendChild(option);
    }

    const schoolName =
      result.school_name ||
      result.school?.name ||
      result.school?.school_name ||
      result.schools?.[0]?.name;

    if (sidebarSchoolName) {
      sidebarSchoolName.textContent = schoolName || "مدرستك";
    }
  }

  function getClassName(classId) {
    if (!classId) return "جميع شعب المدرسة";

    const item = classes.find(
      (entry) => Number(entry.id) === Number(classId)
    );

    if (!item) return `الشعبة ${classId}`;

    const parts = [
      item.stage,
      item.grade_name,
      item.gender,
      item.section_name,
    ].filter(Boolean);

    return parts.length
      ? parts.join(" - ")
      : item.name || `الشعبة ${classId}`;
  }

  function updateStatistics() {
    const now = Date.now();

    const active = announcements.filter(
      (item) => new Date(item.expires_at).getTime() > now
    ).length;

    const expired = announcements.length - active;

    if (totalAnnouncements) {
      totalAnnouncements.textContent = announcements.length;
    }

    if (activeAnnouncements) {
      activeAnnouncements.textContent = active;
    }

    if (expiredAnnouncements) {
      expiredAnnouncements.textContent = expired;
    }
  }

  function getFilteredAnnouncements() {
    const status = filterStatus?.value || "all";
    const audience = filterAudience?.value || "all";
    const now = Date.now();

    return announcements.filter((item) => {
      const isActive = new Date(item.expires_at).getTime() > now;

      if (status === "active" && !isActive) return false;
      if (status === "expired" && isActive) return false;

      if (audience !== "all" && item.audience !== audience) {
        return false;
      }

      return true;
    });
  }

  // عرض الإعلانات والأزرار والصور
  function renderAnnouncements() {
    const filtered = getFilteredAnnouncements();

    if (!filtered.length) {
      announcementsList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">✦</div>
          <strong>لا توجد إعلانات</strong>
          <p>لا توجد إعلانات مطابقة للفلاتر الحالية.</p>
        </div>
      `;
      return;
    }

    announcementsList.innerHTML = filtered.map((item) => {
      const isActive =
        new Date(item.expires_at).getTime() > Date.now();

      const attachments = item.attachments || [];

      const images = attachments.map((attachment) => {
        const imageUrl = attachment.signed_url || attachment.url;

        if (!imageUrl) return "";

        const safeUrl = escapeHTML(imageUrl);

        return `
          <img
            class="announcement-image"
            src="${safeUrl}"
            data-lightbox-src="${safeUrl}"
            alt="صورة الإعلان"
            loading="lazy"
            tabindex="0"
            role="button"
            aria-label="تكبير صورة الإعلان"
          >
        `;
      }).join("");

      const content = item.content
        ? `<p class="announcement-content">${escapeHTML(item.content)}</p>`
        : "";

      return `
        <article class="announcement-item">

          <div class="announcement-top">

            <div class="announcement-meta">

              <span class="announcement-date">
                ${escapeHTML(formatDate(item.created_at))}
              </span>

              <span class="audience-badge">
                ${escapeHTML(audienceNames[item.audience] || item.audience)}
              </span>

              <span class="scope-badge">
                ${escapeHTML(getClassName(item.class_id))}
              </span>

              <span class="status-badge ${isActive ? "active" : "expired"}">
                ${isActive ? "نشط" : "منتهي"}
              </span>

            </div>

          </div>

          ${content}

          ${images ? `
            <div class="announcement-images">
              ${images}
            </div>
          ` : ""}

          <div class="announcement-footer">

            <span class="announcement-expiry">
              ينتهي الإعلان: ${escapeHTML(formatDate(item.expires_at))}
            </span>

            <div class="announcement-actions">

              <button
                type="button"
                class="action-btn edit"
                data-action="edit"
                data-id="${Number(item.id)}"
              >
                <span class="action-icon">✎</span>
                تعديل الإعلان
              </button>

              <button
                type="button"
                class="action-btn delete"
                data-action="delete"
                data-id="${Number(item.id)}"
              >
                <span class="action-icon">⌫</span>
                حذف الإعلان
              </button>

            </div>

          </div>

        </article>
      `;
    }).join("");
  }

  async function loadAnnouncements() {
    updateStatistics();
    renderAnnouncements();
  }

  async function refreshPageData() {
    announcementsList.innerHTML = `
      <div class="loading-state">
        <span class="loading-spinner"></span>
        <p>جاري تحميل الإعلانات...</p>
      </div>
    `;

    try {
      await loadClasses();
      await loadAnnouncements();
    } catch (error) {
      announcementsList.innerHTML = `
        <div class="error-state">
          ${escapeHTML(error.message)}
        </div>
      `;

      showMessage(error.message, "error");
    }
  }

  function clearPreviews() {
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = null;
    }

    newImagesPreview.innerHTML = "";
    existingImagesPreview.innerHTML = "";
  }

  // معاينة الصورة الجديدة
  function showNewImagePreview(file) {
    newImagesPreview.innerHTML = "";

    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = null;
    }

    if (!file) return;

    previewObjectUrl = URL.createObjectURL(file);

    const wrapper = document.createElement("div");
    wrapper.className = "preview-item";

    const image = document.createElement("img");
    image.src = previewObjectUrl;
    image.alt = "معاينة صورة الإعلان";
    image.dataset.lightboxSrc = previewObjectUrl;
    image.tabIndex = 0;
    image.setAttribute("role", "button");

    wrapper.appendChild(image);
    newImagesPreview.appendChild(wrapper);
  }

  // معاينة الصور الموجودة عند تعديل الإعلان
  function showExistingImages(item) {
    existingImagesPreview.innerHTML = "";

    for (const attachment of item.attachments || []) {
      const imageUrl = attachment.signed_url || attachment.url;

      if (!imageUrl) continue;

      const wrapper = document.createElement("div");
      wrapper.className = "preview-item";

      const image = document.createElement("img");

      image.src = imageUrl;
      image.alt = "الصورة الحالية للإعلان";
      image.loading = "lazy";
      image.dataset.lightboxSrc = imageUrl;
      image.tabIndex = 0;
      image.setAttribute("role", "button");

      wrapper.appendChild(image);
      existingImagesPreview.appendChild(wrapper);
    }
  }

  function updateContentCounter() {
    if (!contentCounter) return;

    contentCounter.textContent =
      `${contentInput.value.length} / 5000`;
  }

  function resetForm() {
    editingId = null;
    form.reset();

    audienceInput.value = "both";
    classInput.value = "";

    imageInput.value = "";

    clearPreviews();

    saveButtonText.textContent = "نشر الإعلان";
    submitBtn.disabled = false;

    cancelEditBtn.hidden = true;

    const formTitle = $("formTitle");

    if (formTitle) {
      formTitle.textContent = "إنشاء إعلان جديد";
    }

    updateContentCounter();
  }

  function startEdit(id) {
    const item = announcements.find(
      (entry) => Number(entry.id) === Number(id)
    );

    if (!item) return;

    editingId = item.id;

    contentInput.value = item.content || "";
    audienceInput.value = item.audience || "both";
    classInput.value = item.class_id || "";

    imageInput.value = "";

    clearPreviews();
    showExistingImages(item);

    saveButtonText.textContent = "حفظ التعديلات";
    cancelEditBtn.hidden = false;

    const formTitle = $("formTitle");

    if (formTitle) {
      formTitle.textContent = "تعديل الإعلان";
    }

    updateContentCounter();

    form.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function validateImage(file) {
    if (!file) return true;

    if (file.size > 10 * 1024 * 1024) {
      showMessage(
        "حجم الصورة يجب ألا يتجاوز 10 ميغابايت.",
        "error"
      );
      return false;
    }

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.type)) {
      showMessage(
        "صيغة الصورة غير مدعومة. استخدم JPG أو PNG أو WEBP.",
        "error"
      );
      return false;
    }

    return true;
  }

  async function submitAnnouncement(event) {
    event.preventDefault();
    showMessage("");

    const content = contentInput.value.trim();
    const image = imageInput.files?.[0] || null;

    if (!content && !image && !editingId) {
      showMessage("اكتب نص الإعلان أو أرفق صورة.", "error");
      return;
    }

    if (!validateImage(image)) return;

    const formData = new FormData();

    formData.append("content", content);
    formData.append("audience", audienceInput.value);
    formData.append("class_id", classInput.value);

    if (editingId) {
      formData.append("announcement_id", String(editingId));
    }

    if (image) {
      formData.append("files", image);
    }

    const wasEditing = Boolean(editingId);

    setButtonLoading(
      true,
      wasEditing ? "جارٍ حفظ التعديلات..." : "جارٍ النشر..."
    );

    try {
      const result = await invoke(
        wasEditing ? "update" : "create",
        formData
      );

      resetForm();
      await refreshPageData();

      showMessage(
        result.message ||
          (wasEditing
            ? "تم تعديل الإعلان بنجاح."
            : "تم نشر الإعلان بنجاح."),
        "success"
      );
    } catch (error) {
      showMessage(error.message, "error");
    } finally {
      submitBtn.disabled = false;

      saveButtonText.textContent = editingId
        ? "حفظ التعديلات"
        : "نشر الإعلان";
    }
  }

  function openDeleteConfirmation(id) {
    pendingDeleteId = Number(id);

    deleteModal.hidden = false;
    deleteModal.classList.add("is-open");
  }

  function closeDeleteConfirmation() {
    pendingDeleteId = null;

    deleteModal.hidden = true;
    deleteModal.classList.remove("is-open");
  }

  async function deleteAnnouncement() {
    if (!pendingDeleteId) return;

    confirmDeleteBtn.disabled = true;
    confirmDeleteBtn.textContent = "جارٍ الحذف...";

    try {
      await invoke("delete", {
        announcement_id: pendingDeleteId,
      });

      closeDeleteConfirmation();

      await refreshPageData();

      showMessage("تم حذف الإعلان بنجاح.", "success");
    } catch (error) {
      showMessage(error.message, "error");
      closeDeleteConfirmation();
    } finally {
      confirmDeleteBtn.disabled = false;
      confirmDeleteBtn.textContent = "نعم، احذف الإعلان";
    }
  }

  // أحداث الصفحة
  form.addEventListener("submit", submitAnnouncement);

  imageInput.addEventListener("change", () => {
    const file = imageInput.files?.[0] || null;

    if (!validateImage(file)) {
      imageInput.value = "";
      showNewImagePreview(null);
      return;
    }

    showNewImagePreview(file);
  });

  contentInput.addEventListener("input", updateContentCounter);

  cancelEditBtn.addEventListener("click", resetForm);

  refreshBtn.addEventListener("click", refreshPageData);

  filterStatus?.addEventListener("change", renderAnnouncements);
  filterAudience?.addEventListener("change", renderAnnouncements);

  // النقر على الصور لتكبيرها
  document.addEventListener("click", (event) => {
    const image = event.target.closest("[data-lightbox-src]");

    if (!image) return;

    openImageViewer(
      image.dataset.lightboxSrc,
      image.alt || "صورة الإعلان"
    );
  });

  // دعم تكبير الصور بلوحة المفاتيح
  document.addEventListener("keydown", (event) => {
    if (
      (event.key === "Enter" || event.key === " ") &&
      event.target.matches("[data-lightbox-src]")
    ) {
      event.preventDefault();

      openImageViewer(
        event.target.dataset.lightboxSrc,
        event.target.alt || "صورة الإعلان"
      );
    }
  });

  announcementsList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");

    if (!button) return;

    const id = Number(button.dataset.id);

    if (button.dataset.action === "edit") {
      startEdit(id);
    }

    if (button.dataset.action === "delete") {
      openDeleteConfirmation(id);
    }
  });

  confirmDeleteBtn.addEventListener("click", deleteAnnouncement);
  cancelDeleteBtn.addEventListener("click", closeDeleteConfirmation);

  deleteModal.addEventListener("click", (event) => {
    if (event.target === deleteModal) {
      closeDeleteConfirmation();
    }
  });

  // تشغيل الصفحة
  async function initialize() {
    if (!db?.auth || !db?.functions) {
      showMessage(
        "لم يتم العثور على اتصال Supabase. تحقق من ملف supabase-config.js.",
        "error"
      );

      submitBtn.disabled = true;
      return;
    }

    try {
      const { data, error } = await db.auth.getSession();

      if (error) throw error;

      if (!data?.session) {
        window.location.href = "index.html";
        return;
      }

      await loadAdminInfo();
      await loadClasses();
      await loadAnnouncements();

      updateContentCounter();
    } catch (error) {
      showMessage(error.message, "error");

      announcementsList.innerHTML = `
        <div class="error-state">
          ${escapeHTML(error.message)}
        </div>
      `;
    }
  }

  initialize();
})();
