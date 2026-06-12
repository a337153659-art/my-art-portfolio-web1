(function () {
  const STORAGE_KEY = "paintingPortfolioContent";
  const IMAGE_DB = "paintingPortfolioImages";
  const CONTENT_STORE = "content";
  const IMAGE_STORE = "images";
  const IMAGE_PREFIX = "portfolio-image:";
  const defaultContent = window.portfolioContent;
  let content = clone(defaultContent);
  let isEditing = false;
  let saveTimer;
  const imageUrlCache = new Map();
  const year = new Date().getFullYear();

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeContent(value) {
    value.projectsPage = Object.assign(clone(defaultContent.projectsPage || {}), value.projectsPage || {});
    const savedProjects = value.projects || [];
    const fallbackProjects = defaultContent.projects || [];
    const projectCount = Math.max(savedProjects.length, fallbackProjects.length);

    value.projects = Array.from({ length: projectCount }, (_, index) => {
      const project = savedProjects[index] || {};
      const fallback = clone(defaultContent.projects?.[index] || {});
      const merged = Object.assign(fallback, project);
      merged.category = merged.category || inferProjectCategory(merged);
      merged.videoUrl = project.videoUrl || fallback.videoUrl || "";
      merged.extraDetails = Array.isArray(project.extraDetails)
        ? project.extraDetails
        : Array.isArray(fallback.extraDetails)
          ? fallback.extraDetails
          : [];
      merged.longText = project.longText || fallback.longText || [];
      merged.fullDescription =
        project.fullDescription ||
        fallback.fullDescription ||
        [merged.description, ...merged.longText].filter(Boolean).join("\n\n");
      const savedImages = project.images || [];
      const fallbackImages = fallback.images || [];
      const imageCount = Math.max(savedImages.length, fallbackImages.length);
      merged.images = Array.from({ length: imageCount }, (_, imageIndex) => {
        return Object.assign(clone(fallbackImages[imageIndex] || {}), savedImages[imageIndex] || {});
      });
      return merged;
    });
    return value;
  }

  async function loadContent(fallback) {
    return normalizeContent(clone(fallback));
  }

  function readLocalStorageContent() {
    return null;
  }

  async function saveContent() {
    try {
      await saveContentToDatabase(content);
    } catch (error) {
      const status = document.querySelector("[data-save-status]");
      if (status) status.textContent = "保存失败";
      return;
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(content));
    } catch (error) {
      localStorage.removeItem(STORAGE_KEY);
    }

    const status = document.querySelector("[data-save-status]");
    if (!status) return;

    status.textContent = "已保存";
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      status.textContent = isEditing ? "编辑中" : "已完成";
    }, 1200);
  }

  function getPath(path) {
    return path.split(".").reduce((target, key) => target?.[key], content);
  }

  function setPath(path, value) {
    const keys = path.split(".");
    const last = keys.pop();
    const target = keys.reduce((item, key) => item[key], content);
    target[last] = value;
    saveContent();
  }

  function editable(element, path) {
    if (!element) return element;
    element.dataset.editPath = path;
    element.textContent = getPath(path) || "";
    return element;
  }

  function makeText(tag, className, path) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    return editable(element, path);
  }

  function renderSiteChrome() {
    document.title = `${content.artistName} - Painting Portfolio`;
    editable(document.querySelector(".site-title"), "artistName");

    const footerName = document.querySelector("[data-footer-name]");
    if (footerName) footerName.textContent = content.artistName;

    const footerYear = document.querySelector("[data-year]");
    if (footerYear) footerYear.textContent = year;

    const email = editable(document.querySelector("[data-email]"), "email");
    if (email) email.href = `mailto:${content.email}`;

    document.querySelectorAll(".site-nav a").forEach((link) => {
      const current = link.getAttribute("href").split("#")[0] === currentPageName();
      if (current) link.setAttribute("aria-current", "page");
    });
  }

  function currentPageName() {
    const page = window.location.pathname.split("/").pop() || "index.html";
    return page === "" ? "index.html" : page;
  }

  function renderHome() {
    if (!document.querySelector(".intro")) return;

    editable(document.querySelector(".intro .eyebrow"), "home.eyebrow");
    editable(document.querySelector("#home-title"), "home.title");
    editable(document.querySelector(".intro-text"), "home.intro");
    editable(document.querySelector(".intro-image figcaption"), "home.featuredCaption");

    const featured = document.querySelector(".intro-image .image-button");
    if (!featured) return;

    const featuredImage = content.home.featuredImage;
    featured.dataset.lightboxSrc = featuredImage.src;
    featured.dataset.lightboxCaption = content.home.featuredCaption;
    featured.dataset.editMediaPath = "home.featuredImage";
    const img = featured.querySelector("img");
    setImageSource(img, featuredImage.src);
    img.alt = featuredImage.alt || content.home.featuredCaption;
  }

  function metaLine(item) {
    return [item.year, item.materials, item.dimensions].filter(Boolean).join(" / ");
  }

  function metaElement(itemPath) {
    const meta = document.createElement("p");
    meta.className = "meta";
    ["year", "materials", "dimensions"].forEach((key, index) => {
      if (index) meta.append(document.createTextNode(" / "));
      meta.append(makeText("span", "", `${itemPath}.${key}`));
    });
    return meta;
  }

  function mediaFrame(item, caption, itemPath) {
    const frame = document.createElement("div");
    frame.className = "image-button media-frame";
    frame.dataset.lightboxSrc = item.src;
    frame.dataset.lightboxCaption = caption;
    frame.dataset.editMediaPath = itemPath;

    if (item.type === "video" || isVideoSource(item.src)) {
      const video = document.createElement("video");
      video.controls = true;
      video.preload = "metadata";
      video.playsInline = true;
      setImageSource(video, item.src);
      frame.append(video);
      return frame;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.dataset.lightboxSrc = item.src;
    button.dataset.lightboxCaption = caption;
    button.dataset.editMediaPath = itemPath;

    const img = document.createElement("img");
    img.alt = item.alt || caption;
    img.loading = "lazy";
    setImageSource(img, item.src);

    button.append(img);
    frame.append(button);
    return frame;
  }

  function renderProjects() {
    const projectsRoot = document.querySelector("[data-projects]");
    if (!projectsRoot) return;

    editable(document.querySelector("[data-projects-page-title]"), "projectsPage.title");
    editable(document.querySelector("[data-projects-page-intro]"), "projectsPage.intro");

    projectsRoot.replaceChildren();
    const categorySections = {};
    [
      ["Installation", "Installation"],
      ["Painting", "Painting"]
    ].forEach(([category, title]) => {
      const section = document.createElement("section");
      section.className = "project-category-section";
      section.id = category === "Painting" ? "painting-projects" : "installation-projects";
      section.dataset.projectCategory = category;
      section.innerHTML = `
        <div class="project-category-heading">
          <p class="eyebrow">${title}</p>
          <h2>${title === "Installation" ? "Objects, installations, spatial works" : "Painting / Collage"}</h2>
        </div>
        <div class="project-category-list"></div>
      `;
      categorySections[category] = section.querySelector(".project-category-list");
      projectsRoot.append(section);
    });

    sortedProjectEntries().forEach(([project, projectIndex]) => {
      const projectPath = `projects.${projectIndex}`;
      const article = document.createElement("article");
      article.className = "project";
      article.dataset.projectIndex = String(projectIndex);

      const copy = document.createElement("div");
      copy.className = "project-copy";
      const details = document.createElement("dl");
      details.className = "project-details";
      const detailRows = [
        ["Category", `${projectPath}.category`],
        ["Forms", `${projectPath}.type`],
        ["Materials", `${projectPath}.materials`],
        ["Scale", `${projectPath}.dimensions`],
        ["Focus", `${projectPath}.focus`]
      ];
      detailRows.forEach(([label, path]) => {
        const term = document.createElement("dt");
        term.textContent = label;
        const description = document.createElement("dd");
        description.append(makeText("span", "", path));
        details.append(term, description);
      });
      project.extraDetails.forEach((detail, detailIndex) => {
        const detailPath = `${projectPath}.extraDetails.${detailIndex}`;
        const term = document.createElement("dt");
        term.append(makeText("span", "", `${detailPath}.label`));
        const description = document.createElement("dd");
        description.append(makeText("span", "", `${detailPath}.value`));
        const deleteDetail = document.createElement("button");
        deleteDetail.type = "button";
        deleteDetail.className = "project-delete-detail";
        deleteDetail.dataset.detailDelete = "true";
        deleteDetail.dataset.projectIndex = String(projectIndex);
        deleteDetail.dataset.detailIndex = String(detailIndex);
        deleteDetail.textContent = "删除信息行";
        description.append(deleteDetail);
        details.append(term, description);
      });

      const detailControls = document.createElement("div");
      detailControls.className = "project-detail-controls";
      detailControls.innerHTML = `
        <button type="button" data-detail-add="default" data-project-index="${projectIndex}">添加信息行</button>
        <button type="button" data-detail-add="video" data-project-index="${projectIndex}">添加 Video link</button>
      `;

      copy.append(
        makeText("p", "project-type", `${projectPath}.type`),
        makeText("h3", "", `${projectPath}.title`),
        makeText("p", "project-year", `${projectPath}.year`)
      );

      const projectStatement = makeText("div", "project-statement", `${projectPath}.fullDescription`);
      const videoLink = projectVideoLink(project.videoUrl || project.extraDetails.find((detail) => isVideoDetail(detail))?.value);

      copy.append(projectStatement);
      if (videoLink) copy.append(videoLink);
      copy.append(details, detailControls);

      const galleryShell = document.createElement("div");
      galleryShell.className = "project-gallery-shell";

      const galleryControls = document.createElement("div");
      galleryControls.className = "project-gallery-controls";
      galleryControls.innerHTML = `
        <button type="button" aria-label="Previous image" data-gallery-prev>‹</button>
        <button type="button" aria-label="Next image" data-gallery-next>›</button>
        <span data-gallery-count>1 / ${project.images.length}</span>
        <button class="project-view-media" type="button" data-gallery-view>查看大图</button>
        <button class="project-add-image" type="button" data-gallery-add data-project-index="${projectIndex}">添加图片/视频</button>
        <button class="project-delete-media" type="button" data-gallery-delete data-project-index="${projectIndex}">删除当前</button>
        <button class="project-delete-project" type="button" data-project-delete data-project-index="${projectIndex}">删除项目</button>
      `;

      const images = document.createElement("div");
      images.className = "project-gallery";
      images.dataset.galleryIndex = "0";
      project.images.forEach((image, imageIndex) => {
        const figure = document.createElement("figure");
        figure.className = "project-image";
        const captionText = cleanImageCaption(image.caption);
        const caption = makeText("figcaption", "image-note", `${projectPath}.images.${imageIndex}.caption`);
        if (!captionText) caption.textContent = "";
        figure.append(
          mediaFrame(image, `${project.title}, ${captionText || metaLine(project)}`, `${projectPath}.images.${imageIndex}`),
          caption
        );
        images.append(figure);
      });

      galleryShell.append(galleryControls, images);
      article.append(copy, galleryShell);
      const category = inferProjectCategory(project) === "Painting" ? "Painting" : "Installation";
      categorySections[category].append(article);
    });

    Object.entries(categorySections).forEach(([category, list]) => {
      if (!list.children.length) {
        const empty = document.createElement("p");
        empty.className = "empty-category";
        empty.textContent = isEditing ? "编辑模式下可以在这里添加项目。" : "";
        list.append(empty);
      }
    });

    if (isEditing) {
      setEditing(true);
    }
  }

  function projectVideoLink(url) {
    const href = normalizeExternalUrl(url);
    if (!href) return null;
    const link = document.createElement("a");
    link.className = "project-video-link";
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "View video documentation";
    return link;
  }

  function normalizeExternalUrl(url) {
    const value = String(url || "").trim();
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value;
    if (/^(www\.|youtube\.com|youtu\.be|vimeo\.com)/i.test(value)) return `https://${value}`;
    return "";
  }

  function isVideoDetail(detail) {
    return detail && /video|youtube|vimeo|link|视频/i.test(`${detail.label || ""}`) && normalizeExternalUrl(detail.value);
  }

  function cleanImageCaption(caption) {
    const text = String(caption || "").trim();
    if (!text) return "";
    if (/^(new project image|title, materials, dimensions|add installation view, detail, process image, or video)$/i.test(text)) return "";
    return text;
  }

  function sortedProjectEntries() {
    return content.projects
      .map((project, index) => [project, index])
      .sort(([projectA, indexA], [projectB, indexB]) => {
        const categoryA = inferProjectCategory(projectA);
        const categoryB = inferProjectCategory(projectB);
        if (categoryA !== categoryB) return categoryA === "Installation" ? -1 : 1;
        const yearA = projectYearValue(projectA.year);
        const yearB = projectYearValue(projectB.year);
        if (yearA !== yearB) return yearA - yearB;
        return indexA - indexB;
      });
  }

  function projectYearValue(year) {
    const matches = String(year || "").match(/\d{4}/g);
    if (!matches) return 0;
    return Math.max(...matches.map(Number));
  }

  function renderWorks() {
    const worksRoot = document.querySelector("[data-works]");
    if (!worksRoot) return;

    worksRoot.replaceChildren();
    content.works.forEach((work, workIndex) => {
      const workPath = `works.${workIndex}`;
      const article = document.createElement("article");
      article.className = "work-card";
      article.append(mediaFrame(work, `${work.title}, ${metaLine(work)}`, workPath));

      const copy = document.createElement("div");
      copy.className = "work-card-copy";
      copy.append(makeText("h3", "", `${workPath}.title`), metaElement(workPath));
      article.append(copy);
      worksRoot.append(article);
    });
  }

  function renderResearch() {
    const researchRoot = document.querySelector("[data-research]");
    if (!researchRoot) return;

    researchRoot.replaceChildren();
    content.research.forEach((item, index) => {
      const itemPath = `research.${index}`;
      const section = document.createElement("section");
      section.append(makeText("h3", "", `${itemPath}.title`), makeText("p", "", `${itemPath}.text`));
      researchRoot.append(section);
    });
  }

  function renderWriting() {
    const writingRoot = document.querySelector("[data-writing]");
    if (!writingRoot) return;

    writingRoot.replaceChildren();
    content.writing.forEach((item, index) => {
      const itemPath = `writing.${index}`;
      const article = document.createElement("article");
      article.className = "writing-item";
      const heading = document.createElement("div");
      heading.append(makeText("h3", "", `${itemPath}.title`), makeText("p", "meta", `${itemPath}.year`));
      article.append(heading, makeText("p", "", `${itemPath}.text`));
      writingRoot.append(article);
    });
  }

  function renderCV() {
    const cvRoot = document.querySelector("[data-cv]");
    if (!cvRoot) return;

    cvRoot.replaceChildren();
    content.cv.forEach((group, groupIndex) => {
      const groupPath = `cv.${groupIndex}`;
      const section = document.createElement("section");
      const list = document.createElement("ul");
      group.items.forEach((item, index) => {
        list.append(makeText("li", "", `${groupPath}.items.${index}`));
      });
      section.append(makeText("h3", "", `${groupPath}.heading`), list);
      cvRoot.append(section);
    });
  }

  function renderContact() {
    editable(document.querySelector(".contact-grid p"), "contactText");
  }

  function setupNavigation() {
    const navToggle = document.querySelector("[data-nav-toggle]");
    const nav = document.querySelector("[data-nav]");
    if (!navToggle || !nav) return;

    navToggle.addEventListener("click", () => {
      const isOpen = nav.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", String(isOpen));
    });

    nav.addEventListener("click", (event) => {
      if (event.target.matches("a")) {
        nav.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  function setupLightbox() {
    const lightbox = document.querySelector("[data-lightbox]");
    const lightboxImage = document.querySelector("[data-lightbox-image]");
    const lightboxCaption = document.querySelector("[data-lightbox-caption]");
    const lightboxClose = document.querySelector("[data-lightbox-close]");
    if (!lightbox || !lightboxImage || !lightboxCaption || !lightboxClose) return;

    document.addEventListener("click", async (event) => {
      if (isEditing && event.target.closest("a")) {
        event.preventDefault();
      }

      const galleryButton = event.target.closest("[data-gallery-prev], [data-gallery-next]");
      if (galleryButton) {
        event.preventDefault();
        const shell = galleryButton.closest(".project-gallery-shell");
        const gallery = shell.querySelector(".project-gallery");
        const slides = Array.from(gallery.querySelectorAll(".project-image"));
        if (!slides.length) return;

        const direction = galleryButton.matches("[data-gallery-next]") ? 1 : -1;
        const currentIndex = Number(gallery.dataset.galleryIndex || 0);
        const nextIndex = (currentIndex + direction + slides.length) % slides.length;
        gallery.dataset.galleryIndex = String(nextIndex);
        gallery.scrollTo({
          left: slides[nextIndex].offsetLeft - gallery.offsetLeft,
          behavior: "smooth"
        });
        updateGalleryCount(shell, nextIndex, slides.length);
        return;
      }

      const addImageButton = event.target.closest("[data-gallery-add]");
      if (addImageButton) {
        event.preventDefault();
        if (!isEditing) return;
        addProjectImage(Number(addImageButton.dataset.projectIndex));
        return;
      }

      const viewMediaButton = event.target.closest("[data-gallery-view]");
      if (viewMediaButton) {
        event.preventDefault();
        const shell = viewMediaButton.closest(".project-gallery-shell");
        openCurrentGalleryImage(shell, lightbox, lightboxImage, lightboxCaption);
        return;
      }

      const deleteMediaButton = event.target.closest("[data-gallery-delete]");
      if (deleteMediaButton) {
        event.preventDefault();
        if (!isEditing) return;
        const shell = deleteMediaButton.closest(".project-gallery-shell");
        const gallery = shell.querySelector(".project-gallery");
        const currentIndex = Number(gallery.dataset.galleryIndex || 0);
        deleteProjectMedia(Number(deleteMediaButton.dataset.projectIndex), currentIndex);
        return;
      }

      const deleteProjectButton = event.target.closest("[data-project-delete]");
      if (deleteProjectButton) {
        event.preventDefault();
        if (!isEditing) return;
        deleteProject(Number(deleteProjectButton.dataset.projectIndex));
        return;
      }

      const addDetailButton = event.target.closest("[data-detail-add]");
      if (addDetailButton) {
        event.preventDefault();
        if (!isEditing) return;
        addProjectDetail(Number(addDetailButton.dataset.projectIndex), addDetailButton.dataset.detailAdd);
        return;
      }

      const deleteDetailButton = event.target.closest("[data-detail-delete]");
      if (deleteDetailButton) {
        event.preventDefault();
        if (!isEditing) return;
        deleteProjectDetail(Number(deleteDetailButton.dataset.projectIndex), Number(deleteDetailButton.dataset.detailIndex));
        return;
      }

      const button = event.target.closest("[data-lightbox-src]");
      if (!button) return;

      if (isEditing && button.dataset.editMediaPath) {
        event.preventDefault();
        chooseMedia(button.dataset.editMediaPath);
        return;
      }

      if (event.target.closest("video")) return;

      lightboxImage.src = await resolveImageSource(button.dataset.lightboxSrc);
      lightboxImage.alt = button.dataset.lightboxCaption;
      lightboxCaption.textContent = button.dataset.lightboxCaption;
      lightbox.showModal();
    });

    lightbox.addEventListener("click", (event) => {
      if (event.target === lightbox) lightbox.close();
    });

    lightboxClose.addEventListener("click", () => {
      lightbox.close();
    });
  }

  function setEditing(nextState) {
    isEditing = nextState;
    document.body.classList.toggle("is-editing", isEditing);

    const toggle = document.querySelector("[data-edit-toggle]");
    if (toggle) toggle.textContent = isEditing ? "完成" : "编辑页面";

    const status = document.querySelector("[data-save-status]");
    if (status) status.textContent = isEditing ? "编辑中" : "已完成";

    document.querySelectorAll("[data-edit-path]").forEach((element) => {
      element.contentEditable = isEditing ? "true" : "false";
      element.spellcheck = false;
    });
  }

  function setupEditor() {
    const editToggle = document.querySelector("[data-edit-toggle]");
    const saveNow = document.querySelector("[data-save-now]");
    const exportButton = document.querySelector("[data-export-content]");
    const exportGithubButton = document.querySelector("[data-export-github]");
    const importInput = document.querySelector("[data-import-content]");
    const resetButton = document.querySelector("[data-reset-content]");
    const addProjectButtons = document.querySelectorAll("[data-add-project]");

    if (editToggle) {
      editToggle.addEventListener("click", () => setEditing(!isEditing));
    }

    if (saveNow) {
      saveNow.addEventListener("click", async () => {
        await saveContent();
        const status = document.querySelector("[data-save-status]");
        if (status) status.textContent = "已手动保存";
      });
    }

    document.addEventListener("input", (event) => {
      const target = event.target.closest("[data-edit-path]");
      if (!target || !isEditing) return;

      setPath(target.dataset.editPath, target.textContent.trim());
      if (target.matches("[data-email]")) {
        target.href = `mailto:${target.textContent.trim()}`;
      }
    });

    if (exportButton) {
      exportButton.addEventListener("click", async () => {
        const exportContent = await hydrateImagesForExport(clone(content));
        const source = `window.portfolioContent = ${JSON.stringify(exportContent, null, 2)};\n`;
        const blob = new Blob([source], { type: "text/javascript" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "content.js";
        link.click();
        URL.revokeObjectURL(link.href);
      });
    }

    if (exportGithubButton) {
      exportGithubButton.addEventListener("click", async () => {
        const status = document.querySelector("[data-save-status]");
        if (status) status.textContent = "正在打包...";
        exportGithubButton.disabled = true;
        try {
          await new Promise((resolve) => window.setTimeout(resolve, 50));
          await saveContent();
          await exportGithubPackage();
          if (status) status.textContent = "小包已生成，点下载链接";
        } catch (error) {
          if (status) status.textContent = "打包失败";
          alert("打包失败。请先保存页面，再刷新后重试。");
        } finally {
          exportGithubButton.disabled = false;
        }
      });
    }

    if (importInput) {
      importInput.addEventListener("change", (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.addEventListener("load", () => {
          const text = String(reader.result);
          const json = text.replace(/^window\.portfolioContent\s*=\s*/, "").replace(/;\s*$/, "");
          try {
            content = Object.assign(clone(defaultContent), JSON.parse(json));
            saveContent();
            location.reload();
          } catch (error) {
            alert("导入失败，请选择之前下载的 content.js 文件。");
          }
        });
        reader.readAsText(file);
      });
    }

    if (resetButton) {
      resetButton.addEventListener("click", async () => {
        if (!confirm("确定恢复到初始示例内容吗？")) return;
        localStorage.removeItem(STORAGE_KEY);
        await clearContentDatabase();
        location.reload();
      });
    }

    addProjectButtons.forEach((addProjectButton) => {
      addProjectButton.addEventListener("click", () => {
        if (!isEditing) {
          setEditing(true);
        }
        addProject(addProjectButton.dataset.addProject || "Installation");
      });
    });
  }

  function updateGalleryCount(shell, index, total) {
    const count = shell.querySelector("[data-gallery-count]");
    if (count) count.textContent = `${index + 1} / ${total}`;
  }

  async function openCurrentGalleryImage(shell, lightbox, lightboxImage, lightboxCaption) {
    const gallery = shell.querySelector(".project-gallery");
    const slides = Array.from(gallery.querySelectorAll(".project-image"));
    const currentIndex = Number(gallery.dataset.galleryIndex || 0);
    const currentSlide = slides[currentIndex] || slides[0];
    const media = currentSlide?.querySelector("[data-lightbox-src]");
    if (!media || media.querySelector("video")) return;

    lightboxImage.src = await resolveImageSource(media.dataset.lightboxSrc);
    lightboxImage.alt = media.dataset.lightboxCaption;
    lightboxCaption.textContent = media.dataset.lightboxCaption;
    lightbox.showModal();
  }

  function rerenderKeepingScroll(render) {
    const x = window.scrollX;
    const y = window.scrollY;
    render();
    window.requestAnimationFrame(() => {
      window.scrollTo(x, y);
    });
  }

  function chooseMedia(path) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,video/*";
    input.className = "hidden-file-input";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;

      storeMediaFile(file)
        .then((media) => {
          setPath(`${path}.src`, media.src);
          setPath(`${path}.type`, media.type);
          rerenderKeepingScroll(() => {
            renderHome();
            renderProjects();
          });
        })
        .catch(() => {
          alert("文件保存失败。请换一张小一点的图片，或压缩后的视频再试。");
        });
    });
    document.body.append(input);
    input.click();
  }

  function addProjectImage(projectIndex) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,video/*";
    input.multiple = true;
    input.className = "hidden-file-input";
    input.addEventListener("change", async () => {
      const files = Array.from(input.files || []);
      input.remove();
      if (!files.length) return;

      const status = document.querySelector("[data-save-status]");
      if (status) status.textContent = "正在添加...";

      try {
        for (const file of files) {
          const media = await storeMediaFile(file);
          content.projects[projectIndex].images.push({
            src: media.src,
            type: media.type,
            alt: media.type === "video" ? "Project video" : "Project image",
            caption: media.type === "video" ? "Video documentation, duration" : "Title, materials, dimensions"
          });
        }
        await saveContent();
        rerenderKeepingScroll(renderProjects);
      } catch (error) {
        alert("有文件保存失败。请换小一点的图片，或压缩后的视频再试。");
      }
    });
    document.body.append(input);
    input.click();
  }

  function addProject(category) {
    const isPainting = category === "Painting";
    content.projects.push({
      category,
      type: isPainting ? "Painting / Collage / Drawing" : "Objects and Installations",
      title: isPainting ? "New Painting / Collage Project" : "New Installation Project",
      year: "2026",
      materials: isPainting
        ? "Oil, acrylic, graphite, pigment, canvas, paper"
        : "Materials, supports, objects, painting, installation elements",
      dimensions: "Variable dimensions",
      videoUrl: "",
      extraDetails: [],
      focus: isPainting ? "Surface, image, gesture, process" : "Space, material, image, process",
      description: "Short project summary.",
      fullDescription:
        "Write your project introduction here. You can describe the main idea, how the work developed, and why these works belong together in this project.\n\nYou can also write about materials, scale, process, documentation, and how the viewer encounters the work.",
      longText: [],
      images: [
        {
          src: "assets/work-01.png",
          type: "image",
          alt: "New project placeholder image",
          caption: "Title, materials, dimensions"
        },
        {
          src: "assets/work-02.png",
          type: "image",
          alt: "New project second placeholder image",
          caption: "Title, materials, dimensions"
        }
      ]
    });
    saveContent();
    rerenderKeepingScroll(renderProjects);
  }

  function addProjectDetail(projectIndex, kind) {
    const project = content.projects[projectIndex];
    if (!project) return;
    if (!Array.isArray(project.extraDetails)) project.extraDetails = [];
    project.extraDetails.push(
      kind === "video"
        ? { label: "Video link", value: "https://www.youtube.com/watch?v=" }
        : { label: "New detail", value: "Write value here" }
    );
    saveContent();
    rerenderKeepingScroll(renderProjects);
  }

  function deleteProjectDetail(projectIndex, detailIndex) {
    const project = content.projects[projectIndex];
    if (!project || !Array.isArray(project.extraDetails)) return;
    project.extraDetails.splice(detailIndex, 1);
    saveContent();
    rerenderKeepingScroll(renderProjects);
  }

  function deleteProjectMedia(projectIndex, mediaIndex) {
    const project = content.projects[projectIndex];
    if (!project || project.images.length <= 1) {
      alert("每个项目至少保留一张图片或视频。");
      return;
    }

    if (!confirm("确定删除当前这张图片/视频吗？")) return;
    project.images.splice(mediaIndex, 1);
    saveContent();
    rerenderKeepingScroll(renderProjects);
  }

  function deleteProject(projectIndex) {
    const project = content.projects[projectIndex];
    if (!project) return;

    if (!confirm(`确定删除项目 “${project.title || "Untitled"}” 吗？`)) return;
    content.projects.splice(projectIndex, 1);
    saveContent();
    rerenderKeepingScroll(renderProjects);
  }

  function inferProjectCategory(project) {
    const explicitCategory = `${project.category || ""}`.toLowerCase();
    if (explicitCategory.includes("painting") || explicitCategory.includes("collage") || explicitCategory.includes("绘画") || explicitCategory.includes("拼贴")) {
      return "Painting";
    }
    if (explicitCategory.includes("installation") || explicitCategory.includes("objects") || explicitCategory.includes("装置")) {
      return "Installation";
    }

    const text = `${project.type || ""} ${project.title || ""}`.toLowerCase();
    if (text.includes("painting") || text.includes("collage") || text.includes("绘画") || text.includes("拼贴")) return "Painting";
    if (text.includes("installation") || text.includes("objects") || text.includes("装置")) return "Installation";
    if (text.includes("painting") || text.includes("drawing")) {
      if (!text.includes("installation") && !text.includes("objects") && !text.includes("spatial")) {
        return "Painting";
      }
    }
    return "Installation";
  }

  function resizeImage(src, callback) {
    const image = new Image();
    image.onload = () => {
      const maxSide = 1800;
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      callback(canvas.toDataURL("image/jpeg", 0.88));
    };
    image.src = src;
  }

  function openImageDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(IMAGE_DB, 2);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(IMAGE_STORE)) {
          request.result.createObjectStore(IMAGE_STORE);
        }
        if (!request.result.objectStoreNames.contains(CONTENT_STORE)) {
          request.result.createObjectStore(CONTENT_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function loadContentFromDatabase() {
    return null;
  }

  async function saveContentToDatabase(value) {
    const db = await openImageDB();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(CONTENT_STORE, "readwrite");
      transaction.objectStore(CONTENT_STORE).put(clone(value), "latest");
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  }

  async function clearContentDatabase() {
    try {
      const db = await openImageDB();
      await new Promise((resolve, reject) => {
        const transaction = db.transaction(CONTENT_STORE, "readwrite");
        transaction.objectStore(CONTENT_STORE).delete("latest");
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
      db.close();
    } catch (error) {
      // Local reset should still continue if the browser refuses database access.
    }
  }

  async function storeMediaFile(file) {
    if (file.type.startsWith("video/")) {
      return {
        src: await storeImageBlob(file),
        type: "video"
      };
    }

    const blob = await resizeImageFile(file);
    return {
      src: await storeImageBlob(blob),
      type: "image"
    };
  }

  async function storeImageBlob(blob) {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const db = await openImageDB();

    await new Promise((resolve, reject) => {
      const transaction = db.transaction(IMAGE_STORE, "readwrite");
      transaction.objectStore(IMAGE_STORE).put(blob, id);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });

    db.close();
    return `${IMAGE_PREFIX}${id}`;
  }

  function resizeImageFile(file) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const objectUrl = URL.createObjectURL(file);
      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const maxSide = 1600;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error("Image conversion failed"));
          },
          "image/jpeg",
          0.84
        );
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Image loading failed"));
      };
      image.src = objectUrl;
    });
  }

  async function resolveImageSource(src) {
    if (!src || !src.startsWith(IMAGE_PREFIX)) return src;
    if (imageUrlCache.has(src)) return imageUrlCache.get(src);

    const id = src.slice(IMAGE_PREFIX.length);
    const db = await openImageDB();
    const blob = await new Promise((resolve, reject) => {
      const transaction = db.transaction(IMAGE_STORE, "readonly");
      const request = transaction.objectStore(IMAGE_STORE).get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();

    if (!blob) return "";
    const objectUrl = URL.createObjectURL(blob);
    imageUrlCache.set(src, objectUrl);
    return objectUrl;
  }

  async function setImageSource(img, src) {
    img.src = await resolveImageSource(src);
  }

  function isVideoSource(src) {
    return typeof src === "string" && /\.(mp4|mov|m4v|webm)(\?.*)?$/i.test(src);
  }

  async function hydrateImagesForExport(value) {
    async function walk(target) {
      if (!target || typeof target !== "object") return;
      for (const key of Object.keys(target)) {
        if (key === "src" && typeof target[key] === "string" && target[key].startsWith(IMAGE_PREFIX)) {
          target[key] = await imageRefToDataUrl(target[key]);
        } else {
          await walk(target[key]);
        }
      }
    }

    await walk(value);
    return value;
  }

  async function exportGithubPackage() {
    const files = [];
    const exportResult = await extractMediaToFiles(clone(content), files);
    const contentForGithub = exportResult.content;

    [
      ["index.html", "Home"],
      ["projects.html", "Projects"],
      ["writing.html", "Writing"],
      ["cv.html", "CV"],
      ["contact.html", "Contact"]
    ].forEach(([filename, page]) => {
      files.push({ path: filename, data: pageHtml(filename, page) });
    });

    files.push({ path: "styles.css", data: collectCss() });
    files.push({ path: "app.js", data: publicAppSource() });
    files.push({
      path: "content.js",
      data: `window.portfolioContent = ${JSON.stringify(contentForGithub, null, 2)};\n`
    });
    files.push({
      path: "README.md",
      data: "# Painting Portfolio\n\nPublic GitHub Pages version. Upload all files in this zip to the repository root.\n"
    });

    const zip = await createZip(files);
    const note = exportResult.skipped
      ? `已生成小包；跳过 ${exportResult.skipped} 个视频/超大文件，适合上传 GitHub。`
      : "已生成小包，可以上传 GitHub。";
    showDownloadLink(zip, "painting-portfolio-github-small.zip", note);
  }

  async function extractMediaToFiles(value, files) {
    let index = 1;
    let skipped = 0;
    const maxFileSize = 8 * 1024 * 1024;

    async function shouldSkipMedia(target, src) {
      if (target.type === "video" || src.startsWith("data:video/") || isVideoSource(src)) return true;
      return false;
    }

    async function walk(target) {
      if (!target || typeof target !== "object") return;

      if (Array.isArray(target)) {
        for (let itemIndex = target.length - 1; itemIndex >= 0; itemIndex -= 1) {
          const item = target[itemIndex];
          if (item && typeof item === "object" && typeof item.src === "string" && (await shouldSkipMedia(item, item.src))) {
            target.splice(itemIndex, 1);
            skipped += 1;
          } else {
            await walk(item);
          }
        }
        return;
      }

      for (const key of Object.keys(target)) {
        if (key === "src" && typeof target[key] === "string") {
          const src = target[key];
          if (
            src.startsWith(IMAGE_PREFIX) ||
            src.startsWith("data:image/") ||
            src.startsWith("data:video/") ||
            src.startsWith("assets/")
          ) {
            if (await shouldSkipMedia(target, src)) {
              target[key] = "";
              skipped += 1;
              continue;
            }
            const blob = await mediaSourceToBlob(src);
            if (blob.size > maxFileSize || blob.type.startsWith("video/")) {
              target[key] = "";
              skipped += 1;
              continue;
            }
            const extension = extensionForMime(blob.type);
            const filename = `assets/uploads/media-${String(index).padStart(3, "0")}.${extension}`;
            index += 1;
            files.push({ path: filename, data: blob });
            target[key] = filename;
          }
        } else {
          await walk(target[key]);
        }
      }
    }

    await walk(value);
    let addedPlaceholder = false;
    value.projects?.forEach((project) => {
      if (Array.isArray(project.images) && !project.images.length) {
        if (!addedPlaceholder) {
          files.push({
            path: "assets/uploads/video-removed.svg",
            data: `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="#f4f3f0"/><text x="600" y="400" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" fill="#777">Video documentation removed from GitHub small package</text></svg>`
          });
          addedPlaceholder = true;
        }
        project.images.push({
          src: "assets/uploads/video-removed.svg",
          type: "image",
          alt: "Project image",
          caption: "Video documentation removed from GitHub small package"
        });
      }
    });
    return { content: value, skipped };
  }

  async function mediaSourceToBlob(src) {
    if (src.startsWith(IMAGE_PREFIX)) {
      const id = src.slice(IMAGE_PREFIX.length);
      const db = await openImageDB();
      const blob = await new Promise((resolve, reject) => {
        const transaction = db.transaction(IMAGE_STORE, "readonly");
        const request = transaction.objectStore(IMAGE_STORE).get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      db.close();
      if (!blob) throw new Error("Missing media");
      return blob;
    }

    try {
      const response = await fetch(src);
      if (response.ok) return response.blob();
    } catch (error) {
      // file:// exports cannot always fetch local assets; use the loaded image path.
    }
    return imageToBlob(src);
  }

  function imageToBlob(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth || image.width;
        canvas.height = image.naturalHeight || image.height;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Cannot export image"));
        }, "image/jpeg", 0.88);
      };
      image.onerror = () => reject(new Error(`Cannot load ${src}`));
      image.src = src;
    });
  }

  function pageHtml(filename, page) {
    const body = {
      Home: `
      <section class="intro section-pad" id="home" aria-labelledby="home-title">
        <div class="intro-copy">
          <p class="eyebrow">Contemporary Painting Portfolio</p>
          <h1 id="home-title">Painting as a way of holding uncertain images.</h1>
          <p class="intro-text"></p>
          <a class="intro-link" href="projects.html">View projects</a>
        </div>
        <figure class="intro-image">
          <button class="image-button" type="button" data-lightbox-src="" data-lightbox-caption="">
            <img src="" alt="" />
          </button>
          <figcaption></figcaption>
        </figure>
      </section>`,
      Projects: `
      <section class="section-pad page-start" aria-labelledby="projects-title">
        <div class="section-heading">
          <p class="eyebrow">Projects</p>
          <div>
            <h1 id="projects-title" data-projects-page-title>Projects</h1>
            <p class="page-intro" data-projects-page-intro></p>
            <nav class="project-jump-links" aria-label="Project sections">
              <a href="#installation-projects">Installation</a>
              <a href="#painting-projects">Painting</a>
            </nav>
          </div>
        </div>
        <div class="projects-list" data-projects></div>
      </section>`,
      Writing: `
      <section class="text-section section-pad page-start" aria-labelledby="writing-title">
        <div class="section-heading"><p class="eyebrow">Writing</p><h1 id="writing-title">Notes and statements</h1></div>
        <div class="writing-list" data-writing></div>
      </section>`,
      CV: `
      <section class="text-section section-pad page-start" aria-labelledby="cv-title">
        <div class="section-heading"><p class="eyebrow">CV</p><h1 id="cv-title">Education, projects, skills</h1></div>
        <div class="cv-list" data-cv></div>
      </section>`,
      Contact: `
      <section class="contact section-pad page-start" aria-labelledby="contact-title">
        <div class="section-heading"><p class="eyebrow">Contact</p><h1 id="contact-title">Studio correspondence</h1></div>
        <div class="contact-grid"><p></p><p><a data-email href="mailto:your.email@example.com">your.email@example.com</a></p></div>
      </section>`
    }[page];

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${page} - Painting Portfolio</title>
    <meta name="description" content="Contemporary painting portfolio." />
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <header class="site-header">
      <a class="site-title" href="index.html" aria-label="Back to Home">Your Name</a>
      <button class="nav-toggle" type="button" aria-label="Open navigation" aria-expanded="false" data-nav-toggle><span></span><span></span></button>
      <nav class="site-nav" aria-label="Primary navigation" data-nav>
        <a href="index.html"${filename === "index.html" ? ' aria-current="page"' : ""}>Home</a>
        <a href="projects.html#installation-projects"${filename === "projects.html" ? ' aria-current="page"' : ""}>Installation</a>
        <a href="projects.html#painting-projects"${filename === "projects.html" ? ' aria-current="page"' : ""}>Painting</a>
        <a href="writing.html"${filename === "writing.html" ? ' aria-current="page"' : ""}>Writing</a>
        <a href="cv.html"${filename === "cv.html" ? ' aria-current="page"' : ""}>CV</a>
        <a href="contact.html"${filename === "contact.html" ? ' aria-current="page"' : ""}>Contact</a>
      </nav>
    </header>
    <main>${body}
    </main>
    <footer class="site-footer"><p>&copy; <span data-year></span> <span data-footer-name>Your Name</span></p></footer>
    <dialog class="lightbox" data-lightbox aria-label="Image preview">
      <button class="lightbox-close" type="button" aria-label="Close image preview" data-lightbox-close>Close</button>
      <figure><img alt="" data-lightbox-image /><figcaption data-lightbox-caption></figcaption></figure>
    </dialog>
    <script src="content.js"></script>
    <script src="app.js"></script>
  </body>
</html>`;
  }

  function collectCss() {
    let css = "";
    try {
      Array.from(document.styleSheets).forEach((sheet) => {
        Array.from(sheet.cssRules || []).forEach((rule) => {
          css += `${rule.cssText}\n`;
        });
      });
    } catch (error) {
      css = "body{font-family:Arial,sans-serif;margin:0;background:#fbfbfa;color:#161616}.site-header{display:flex;justify-content:space-between;padding:24px;border-bottom:1px solid #ddd}.site-nav{display:flex;gap:16px}.section-pad{max-width:1152px;margin:auto;padding:80px 32px}img,video{max-width:100%}.project{border-top:1px solid #ddd;padding-top:24px;margin-top:64px}.project-gallery{display:flex;gap:24px;overflow-x:auto}.project-image{flex:0 0 82%}.lightbox{border:0;width:min(92vw,76rem)}";
    }

    return `${css}
.editor-panel, .project-add-project, .project-gallery-controls .project-add-image, .project-gallery-controls .project-delete-media, .project-gallery-controls .project-delete-project { display: none !important; }
`;
  }

  function publicAppSource() {
    return `(function () {
  const content = window.portfolioContent;
  const year = new Date().getFullYear();
  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const make = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text || "";
    return el;
  };
  const metaLine = (item) => [item.year, item.materials, item.dimensions].filter(Boolean).join(" / ");
  const isVideo = (item) => item.type === "video" || /\\.(mp4|mov|m4v|webm)(\\?.*)?$/i.test(item.src || "");
  const normalizeExternalUrl = (url) => {
    const value = String(url || "").trim();
    if (!value) return "";
    if (/^https?:\\/\\//i.test(value)) return value;
    if (/^(www\\.|youtube\\.com|youtu\\.be|vimeo\\.com)/i.test(value)) return "https://" + value;
    return "";
  };

  function projectVideoLink(url) {
    const href = normalizeExternalUrl(url);
    if (!href) return null;
    const link = make("a", "project-video-link", "View video documentation");
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    return link;
  }

  const isVideoDetail = (detail) => detail && /video|youtube|vimeo|link|视频/i.test(String(detail.label || "")) && normalizeExternalUrl(detail.value);
  const cleanImageCaption = (caption) => {
    const text = String(caption || "").trim();
    if (!text) return "";
    if (/^(new project image|title, materials, dimensions|add installation view, detail, process image, or video)$/i.test(text)) return "";
    return text;
  };
  const projectYearValue = (year) => {
    const matches = String(year || "").match(/\\d{4}/g);
    if (!matches) return 0;
    return Math.max(...matches.map(Number));
  };
  const sortedProjects = () => content.projects
    .map((project, index) => [project, index])
    .sort(([a, indexA], [b, indexB]) => {
      const categoryA = categoryFor(a);
      const categoryB = categoryFor(b);
      if (categoryA !== categoryB) return categoryA === "Installation" ? -1 : 1;
      const yearA = projectYearValue(a.year);
      const yearB = projectYearValue(b.year);
      if (yearA !== yearB) return yearA - yearB;
      return indexA - indexB;
    });

  function renderChrome() {
    document.title = content.artistName + " - Painting Portfolio";
    const title = q(".site-title");
    if (title) title.textContent = content.artistName;
    const footerName = q("[data-footer-name]");
    if (footerName) footerName.textContent = content.artistName;
    const footerYear = q("[data-year]");
    if (footerYear) footerYear.textContent = year;
    const email = q("[data-email]");
    if (email) {
      email.textContent = content.email;
      email.href = "mailto:" + content.email;
    }
  }

  function mediaFrame(item, caption) {
    const frame = make("div", "image-button media-frame");
    frame.dataset.lightboxSrc = item.src;
    frame.dataset.lightboxCaption = caption || "";
    if (isVideo(item)) {
      const video = document.createElement("video");
      video.controls = true;
      video.preload = "metadata";
      video.playsInline = true;
      video.src = item.src;
      frame.append(video);
      return frame;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.lightboxSrc = item.src;
    button.dataset.lightboxCaption = caption || "";
    const img = document.createElement("img");
    img.src = item.src;
    img.alt = item.alt || caption || "";
    img.loading = "lazy";
    button.append(img);
    frame.append(button);
    return frame;
  }

  function renderHome() {
    if (!q(".intro")) return;
    q(".intro .eyebrow").textContent = content.home.eyebrow;
    q("#home-title").textContent = content.home.title;
    q(".intro-text").textContent = content.home.intro;
    q(".intro-image figcaption").textContent = content.home.featuredCaption;
    const featured = q(".intro-image .image-button");
    const img = q(".intro-image img");
    featured.dataset.lightboxSrc = content.home.featuredImage.src;
    featured.dataset.lightboxCaption = content.home.featuredCaption;
    img.src = content.home.featuredImage.src;
    img.alt = content.home.featuredImage.alt || content.home.featuredCaption;
  }

  function categoryFor(project) {
    const category = (project.category || "").toLowerCase();
    if (category.includes("painting") || category.includes("collage")) return "Painting";
    if (category.includes("installation") || category.includes("objects")) return "Installation";
    const type = (project.type || "").toLowerCase();
    return type.includes("painting") || type.includes("collage") ? "Painting" : "Installation";
  }

  function renderProjects() {
    const root = q("[data-projects]");
    if (!root) return;
    q("[data-projects-page-title]").textContent = content.projectsPage.title;
    q("[data-projects-page-intro]").textContent = content.projectsPage.intro;
    root.replaceChildren();
    const sections = {};
    [["Installation", "Objects, installations, spatial works"], ["Painting", "Painting / Collage"]].forEach(([category, heading]) => {
      const section = make("section", "project-category-section");
      section.id = category === "Painting" ? "painting-projects" : "installation-projects";
      const head = make("div", "project-category-heading");
      head.append(make("p", "eyebrow", category), make("h2", "", heading));
      const list = make("div", "project-category-list");
      section.append(head, list);
      sections[category] = list;
      root.append(section);
    });
    sortedProjects().forEach(([project, projectIndex]) => {
      const article = make("article", "project");
      const copy = make("div", "project-copy");
      const details = make("dl", "project-details");
      const category = categoryFor(project);
      [["Category", project.category], ["Forms", project.type], ["Materials", project.materials], ["Scale", project.dimensions], ["Focus", project.focus]].forEach(([label, value]) => {
        details.append(make("dt", "", label), make("dd", "", value));
      });
      (project.extraDetails || []).filter((detail) => detail.label || detail.value).forEach((detail) => {
        details.append(make("dt", "", detail.label), make("dd", "", detail.value));
      });
      copy.append(make("p", "project-type", project.type), make("h3", "", project.title), make("p", "project-year", project.year), make("div", "project-statement", project.fullDescription || project.description || ""));
      const videoLink = projectVideoLink(project.videoUrl || (project.extraDetails || []).find(isVideoDetail)?.value);
      if (videoLink) copy.append(videoLink);
      copy.append(details);
      const shell = make("div", "project-gallery-shell");
      const controls = make("div", "project-gallery-controls");
      controls.innerHTML = '<button type="button" data-gallery-prev>‹</button><button type="button" data-gallery-next>›</button><span data-gallery-count>1 / ' + project.images.length + '</span><button class="project-view-media" type="button" data-gallery-view>查看大图</button>';
      const gallery = make("div", "project-gallery");
      gallery.dataset.galleryIndex = "0";
      project.images.forEach((item) => {
        const figure = make("figure", "project-image");
        const note = cleanImageCaption(item.caption);
        figure.append(mediaFrame(item, note || project.title));
        if (note) figure.append(make("figcaption", "image-note", note));
        gallery.append(figure);
      });
      shell.append(controls, gallery);
      article.append(copy, shell);
      sections[category].append(article);
    });
  }

  function renderWorks() {
    const root = q("[data-works]");
    if (!root) return;
    content.works.forEach((work) => {
      const article = make("article", "work-card");
      article.append(mediaFrame(work, work.title));
      const copy = make("div", "work-card-copy");
      copy.append(make("h3", "", work.title), make("p", "meta", metaLine(work)));
      article.append(copy);
      root.append(article);
    });
  }

  function renderResearch() {
    const root = q("[data-research]");
    if (!root) return;
    content.research.forEach((item) => {
      const section = document.createElement("section");
      section.append(make("h3", "", item.title), make("p", "", item.text));
      root.append(section);
    });
  }

  function renderWriting() {
    const root = q("[data-writing]");
    if (!root) return;
    content.writing.forEach((item) => {
      const article = make("article", "writing-item");
      const heading = document.createElement("div");
      heading.append(make("h3", "", item.title), make("p", "meta", item.year));
      article.append(heading, make("p", "", item.text));
      root.append(article);
    });
  }

  function renderCV() {
    const root = q("[data-cv]");
    if (!root) return;
    content.cv.forEach((group) => {
      const section = document.createElement("section");
      const list = document.createElement("ul");
      group.items.forEach((item) => list.append(make("li", "", item)));
      section.append(make("h3", "", group.heading), list);
      root.append(section);
    });
  }

  function renderContact() {
    const text = q(".contact-grid p");
    if (text) text.textContent = content.contactText;
  }

  function setup() {
    const navToggle = q("[data-nav-toggle]");
    const nav = q("[data-nav]");
    if (navToggle && nav) {
      navToggle.addEventListener("click", () => {
        const open = nav.classList.toggle("is-open");
        navToggle.setAttribute("aria-expanded", String(open));
      });
    }
    const lightbox = q("[data-lightbox]");
    const lightboxImage = q("[data-lightbox-image]");
    const lightboxCaption = q("[data-lightbox-caption]");
    document.addEventListener("click", (event) => {
      const galleryButton = event.target.closest("[data-gallery-prev], [data-gallery-next]");
      if (galleryButton) {
        const shell = galleryButton.closest(".project-gallery-shell");
        const gallery = q(".project-gallery", shell);
        const slides = qa(".project-image", gallery);
        const direction = galleryButton.matches("[data-gallery-next]") ? 1 : -1;
        const current = Number(gallery.dataset.galleryIndex || 0);
        const next = (current + direction + slides.length) % slides.length;
        gallery.dataset.galleryIndex = String(next);
        gallery.scrollTo({ left: slides[next].offsetLeft - gallery.offsetLeft, behavior: "smooth" });
        q("[data-gallery-count]", shell).textContent = (next + 1) + " / " + slides.length;
        return;
      }
      const viewButton = event.target.closest("[data-gallery-view]");
      if (viewButton) {
        const shell = viewButton.closest(".project-gallery-shell");
        const gallery = q(".project-gallery", shell);
        const slides = qa(".project-image", gallery);
        const current = Number(gallery.dataset.galleryIndex || 0);
        const media = q("[data-lightbox-src]", slides[current]);
        if (!media || q("video", media)) return;
        lightboxImage.src = media.dataset.lightboxSrc;
        lightboxImage.alt = media.dataset.lightboxCaption;
        lightboxCaption.textContent = media.dataset.lightboxCaption;
        lightbox.showModal();
        return;
      }
      const media = event.target.closest("[data-lightbox-src]");
      if (!media || event.target.closest("video")) return;
      lightboxImage.src = media.dataset.lightboxSrc;
      lightboxImage.alt = media.dataset.lightboxCaption;
      lightboxCaption.textContent = media.dataset.lightboxCaption;
      lightbox.showModal();
    });
    const close = q("[data-lightbox-close]");
    if (close) close.addEventListener("click", () => lightbox.close());
    if (lightbox) lightbox.addEventListener("click", (event) => { if (event.target === lightbox) lightbox.close(); });
  }

  renderChrome();
  renderHome();
  renderProjects();
  renderWriting();
  renderCV();
  renderContact();
  setup();
})();`;
  }

  function extensionForMime(mime) {
    if (mime.includes("png")) return "png";
    if (mime.includes("webp")) return "webp";
    if (mime.includes("gif")) return "gif";
    if (mime.includes("mp4")) return "mp4";
    if (mime.includes("quicktime")) return "mov";
    if (mime.includes("webm")) return "webm";
    return mime.startsWith("video/") ? "mp4" : "jpg";
  }

  async function createZip(entries) {
    const encoder = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;

    for (const entry of entries) {
      const nameBytes = encoder.encode(entry.path);
      const dataBytes = await entryDataBytes(entry.data);
      const crc = crc32(dataBytes);
      const localHeader = zipLocalHeader(nameBytes, dataBytes.length, crc);
      chunks.push(localHeader, nameBytes, dataBytes);
      central.push(zipCentralHeader(nameBytes, dataBytes.length, crc, offset));
      offset += localHeader.length + nameBytes.length + dataBytes.length;
    }

    const centralOffset = offset;
    let centralSize = 0;
    for (const item of central) {
      chunks.push(item.header, item.nameBytes);
      centralSize += item.header.length + item.nameBytes.length;
    }
    chunks.push(zipEndRecord(entries.length, centralSize, centralOffset));
    return new Blob(chunks, { type: "application/zip" });
  }

  async function entryDataBytes(data) {
    if (typeof data === "string") return new TextEncoder().encode(data);
    if (data instanceof Uint8Array) return data;
    const buffer = await data.arrayBuffer();
    return new Uint8Array(buffer);
  }

  function zipLocalHeader(nameBytes, size, crc) {
    const header = new Uint8Array(30);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, size, true);
    view.setUint32(22, size, true);
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true);
    return header;
  }

  function zipCentralHeader(nameBytes, size, crc, offset) {
    const header = new Uint8Array(46);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    view.setUint16(14, 0, true);
    view.setUint32(16, crc, true);
    view.setUint32(20, size, true);
    view.setUint32(24, size, true);
    view.setUint16(28, nameBytes.length, true);
    view.setUint16(30, 0, true);
    view.setUint16(32, 0, true);
    view.setUint16(34, 0, true);
    view.setUint16(36, 0, true);
    view.setUint32(38, 0, true);
    view.setUint32(42, offset, true);
    return { header, nameBytes };
  }

  function zipEndRecord(count, centralSize, centralOffset) {
    const header = new Uint8Array(22);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(8, count, true);
    view.setUint16(10, count, true);
    view.setUint32(12, centralSize, true);
    view.setUint32(16, centralOffset, true);
    return header;
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[i] = c >>> 0;
    }
    return table;
  })();

  function downloadBlob(blob, filename) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function showDownloadLink(blob, filename, message = "") {
    const panel = document.querySelector("[data-editor-panel]");
    if (!panel) {
      downloadBlob(blob, filename);
      return;
    }

    const oldLink = panel.querySelector("[data-generated-github-download]");
    if (oldLink) {
      URL.revokeObjectURL(oldLink.href);
      oldLink.remove();
    }
    const oldNote = panel.querySelector("[data-generated-github-note]");
    if (oldNote) oldNote.remove();

    const link = document.createElement("a");
    link.dataset.generatedGithubDownload = "true";
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.textContent = "点这里下载小包";
    link.className = "generated-download-link";
    panel.append(link);

    if (message) {
      const note = document.createElement("span");
      note.dataset.generatedGithubNote = "true";
      note.textContent = message;
      panel.append(note);
    }
  }

  async function imageRefToDataUrl(ref) {
    const src = await resolveImageSource(ref);
    if (!src.startsWith("blob:")) return src;
    const response = await fetch(src);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function migrateInlineImages() {
    let changed = false;

    async function walk(target) {
      if (!target || typeof target !== "object") return;
      for (const key of Object.keys(target)) {
        if (key === "src" && typeof target[key] === "string" && target[key].startsWith("data:image/")) {
          const response = await fetch(target[key]);
          const blob = await response.blob();
          target[key] = await storeImageBlob(blob);
          changed = true;
        } else {
          await walk(target[key]);
        }
      }
    }

    await walk(content);
    if (changed) saveContent();
  }

  async function init() {
    content = await loadContent(defaultContent);
    await migrateInlineImages();
    renderSiteChrome();
    renderHome();
    renderProjects();
    renderWriting();
    renderCV();
    renderContact();
    setupNavigation();
    setupLightbox();
    setupEditor();
  }

  init();
})();
