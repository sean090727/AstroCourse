const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const VERCEL_LOCAL_KEY = "astrocourse.vercelV1.fullState";
const VERCEL_PASSWORD = "1211";
const VERCEL_SAFETY_KEY = "astrocourse.vercelV1.safetyBackup";
const VERCEL_TEXT_BACKUP_KEY = "astrocourse.vercelV1.textBackup";
const MAX_SHARED_BODY_SIZE = 4300000;
const MAX_IMAGE_DATA_URL_SIZE = 850000;


const statusLabels = {
  idea: "아이디어",
  research: "자료조사",
  draft: "초안",
  review: "검토",
  published: "발행"
};

const app = {
  courses: {},
  state: { articles: {}, settings: {}, courses: null },
  currentCourseId: "main",
  selectedChapterId: "",
  selectedArticleId: "",
  selectedImageId: "",
  lockedCourses: [],
  mode: "tree",
  readOnly: false,
  dirty: false
};

function currentCourse() {
  return app.courses[app.currentCourseId];
}

function chapters() {
  return currentCourse()?.chapters || [];
}

function articles() {
  return chapters().flatMap(chapter => chapter.articles || []);
}

function stateKey(id) {
  return `${app.currentCourseId}:${id}`;
}

function defaultArticleState() {
  return {
    status: "idea",
    priority: "normal",
    mainBlog: app.currentCourseId === "main",
    olympiad: app.currentCourseId === "olympiad",
    book: app.currentCourseId === "book",
    question: "",
    facts: "",
    concepts: "",
    deferred: "",
    notes: "",
    math: "",
    problem: "",
    solutionLink: "",
    sources: [],
    images: []
  };
}

function articleState(id) {
  const key = stateKey(id);
  if (!app.state.articles[key]) app.state.articles[key] = defaultArticleState();
  if (!Array.isArray(app.state.articles[key].images)) app.state.articles[key].images = [];
  return app.state.articles[key];
}

function selectedChapter() {
  return chapters().find(chapter => chapter.id === app.selectedChapterId);
}

function selectedArticle() {
  return articles().find(article => article.id === app.selectedArticleId);
}

function lockedCourse(courseId) {
  return app.lockedCourses.find(course => course.id === courseId) && !app.courses[courseId];
}

function markDirty() {
  if (app.readOnly) return;
  app.dirty = true;
  $("#saveState").textContent = "저장 필요";
}

function ownerModeActive() {
  const params = new URLSearchParams(location.search);
  if (params.get("token") === VERCEL_PASSWORD) {
    sessionStorage.setItem("astrocourse.vercelV1.owner", "true");
    return true;
  }
  sessionStorage.removeItem("astrocourse.vercelV1.owner");
  return false;
}

function unlockEditing() {
  const password = prompt("편집 비밀번호를 입력하세요.");
  if (password !== VERCEL_PASSWORD) {
    alert("비밀번호가 맞지 않습니다.");
    return;
  }
  sessionStorage.setItem("astrocourse.vercelV1.owner", "true");
  const params = new URLSearchParams(location.search);
  params.set("token", VERCEL_PASSWORD);
  params.set("course", app.currentCourseId || "book");
  location.href = location.pathname + "?" + params.toString();
}

function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

function buildFullData() {
  app.state.courses = app.courses;
  app.state.settings = app.state.settings || {};
  app.state.settings.currentCourseId = app.currentCourseId;

  const full = app.fullData || { courses: {}, state: { articles: {}, settings: {}, courses: {} } };
  full.state = full.state || { articles: {}, settings: {}, courses: {} };
  full.state.articles = full.state.articles || {};
  full.state.settings = full.state.settings || {};
  full.state.courses = full.state.courses || full.courses || {};
  full.courses = full.state.courses;

  Object.entries(app.courses || {}).forEach(([id, course]) => {
    full.state.courses[id] = course;
  });
  Object.entries(app.state.articles || {}).forEach(([key, value]) => {
    full.state.articles[key] = value;
  });
  full.state.settings.currentCourseId = app.currentCourseId;
  full.state.settings.publicReadOnly = false;
  full.state.settings.lockedCourses = [];
  return full;
}

function dataWithoutImages(data) {
  const copy = cloneData(data);
  Object.values(copy.state?.articles || {}).forEach(article => {
    if (Array.isArray(article.images) && article.images.length) {
      article.images = article.images.map(image => ({
        id: image.id,
        name: image.name,
        type: image.type,
        omittedFromSharedSave: true
      }));
    }
  });
  return copy;
}

function storeSafetyBackup(data) {
  try {
    localStorage.setItem(VERCEL_SAFETY_KEY, JSON.stringify({ savedAt: new Date().toISOString(), data }));
  } catch (error) {
    try {
      localStorage.setItem(VERCEL_TEXT_BACKUP_KEY, JSON.stringify({ savedAt: new Date().toISOString(), data: dataWithoutImages(data) }));
    } catch {}
  }
}

let safetyTimer = null;
function scheduleSafetyBackup() {
  if (app.readOnly) return;
  clearTimeout(safetyTimer);
  safetyTimer = setTimeout(() => {
    try {
      collectEditor();
      storeSafetyBackup(buildFullData());
    } catch (error) {
      console.warn("Safety backup failed", error);
    }
  }, 500);
}

function migrateArticleStateId(oldId, newId) {
  if (oldId === newId) return;
  const oldKey = stateKey(oldId);
  const newKey = stateKey(newId);
  if (app.state.articles[oldKey] && !app.state.articles[newKey]) {
    app.state.articles[newKey] = app.state.articles[oldKey];
    delete app.state.articles[oldKey];
  }
}

function articlePrefixForChapter(chapter) {
  if (/^[A-Za-z]+\d+/.test(chapter.id)) return chapter.id;
  return chapter.id.match(/^(\d+)/)?.[1] || chapter.id || "0";
}

function renumberArticlesInChapter(chapter) {
  const prefix = articlePrefixForChapter(chapter);
  (chapter.articles || []).forEach((article, index) => {
    const oldId = article.id;
    const nextId = prefix + "." + String(index + 1).padStart(2, "0");
    article.id = nextId;
    article.chapterId = chapter.id;
    article.chapterTitle = chapter.title;
    migrateArticleStateId(oldId, nextId);
    if (app.selectedArticleId === oldId) app.selectedArticleId = nextId;
  });
}

function normalizeArticleIdInput(article, rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) return article.id;
  const chapter = chapters().find(item => item.id === article.chapterId) || selectedChapter();
  const prefix = articlePrefixForChapter(chapter || {});
  if (/^\d+$/.test(value)) return prefix + "." + value.padStart(2, "0");
  if (/^\.\d+$/.test(value)) return prefix + value.replace(/^\.(\d+)$/, (_, number) => "." + number.padStart(2, "0"));
  return value;
}

function refreshAfterStructureChange() {
  markDirty();
  renderChapters();
  renderDashboard();
  renderArticleList();
  if (app.selectedArticleId) selectArticle(app.selectedArticleId);
  else clearEditor();
}
async function loadSharedData() {
  try {
    const res = await fetch("/api/state", { cache: "no-store" });
    if (!res.ok) throw new Error("Shared state load failed: " + res.status);
    const payload = await res.json();
    if (payload?.data) return payload.data;
    if (payload?.ok && payload.data === null) return null;
    return payload;
  } catch (error) {
    console.warn("Shared state is unavailable; falling back to local state.", error);
    return null;
  }
}

function encodeJsonBase64(data) {
  const json = JSON.stringify(data);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  return btoa(binary);
}

async function saveSharedData(data) {
  try {
    const res = await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ encoded: encodeJsonBase64(data) })
    });
    if (!res.ok) throw new Error("Shared state save failed: " + res.status);
    const payload = await res.json();
    if (!payload?.ok) throw new Error(payload?.error || "Shared state save failed.");
    return true;
  } catch (error) {
    console.warn("Shared state save failed; local backup remains available.", error);
    return false;
  }
}

async function load() {
  let data = await loadSharedData();
  let loadedFromShared = !!data;

  if (!data) {
    try {
      data = JSON.parse(localStorage.getItem(VERCEL_LOCAL_KEY) || "null");
    } catch (error) {
      console.warn("Saved Vercel state could not be parsed.", error);
    }
  }

  if (!data) {
    const res = await fetch("/data/course_state.seed.json", { cache: "no-store" });
    const seeded = await res.json();
    data = { courses: seeded.courses || {}, state: seeded };
  }

  const params = new URLSearchParams(location.search);
  const shareMode = params.get("mode") === "share";
  const requestedCourse = params.get("course");
  const tokenOwner = params.get("token") === VERCEL_PASSWORD;
  if (tokenOwner) sessionStorage.setItem("astrocourse.vercelV1.owner", "true");
  const ownerMode = ownerModeActive();

  app.fullData = data;
  app.state = JSON.parse(JSON.stringify(data.state || { articles: {}, settings: {}, courses: data.courses || {} }));
  app.state.articles = app.state.articles || {};
  app.state.settings = app.state.settings || {};
  app.courses = app.state.courses || data.courses || {};
  app.state.courses = app.courses;
  app.readOnly = !ownerMode;
  app.lockedCourses = [];

  if (shareMode && !ownerMode && app.courses.book) {
    const fullCourses = app.courses;
    app.lockedCourses = Object.values(fullCourses)
      .filter(course => course.id !== "book")
      .map(course => ({ id: course.id, title: course.title }));
    app.courses = { book: fullCourses.book };
    app.state.courses = app.courses;
    app.state.settings.currentCourseId = "book";
  }

  app.currentCourseId = requestedCourse || app.state.settings?.currentCourseId || (shareMode ? "book" : "main");
  if (!app.courses[app.currentCourseId]) app.currentCourseId = Object.keys(app.courses)[0];
  $("#courseSelect").value = app.currentCourseId;
  app.selectedChapterId = chapters()[0]?.id || "";
  renderAll();
  applyAccessMode();
  $("#saveState").textContent = loadedFromShared ? "공유본 불러옴" : (shareMode && !ownerMode ? "공유 편집" : "불러옴");
}

async function save() {
  if (app.readOnly) {
    alert("읽기 전용 모드에서는 저장할 수 없습니다.");
    return;
  }
  collectEditor();
  const full = buildFullData();
  storeSafetyBackup(full);

  let localSaved = false;
  try {
    localStorage.setItem(VERCEL_LOCAL_KEY, JSON.stringify(full));
    app.fullData = full;
    localSaved = true;
  } catch (error) {
    downloadVercelBackup(full);
    alert("브라우저 저장공간이 부족해서 백업 JSON 파일을 만들었어요. 이미지가 많으면 이런 일이 생길 수 있어요.");
  }

  let dataForShared = full;
  let imagesOmitted = false;
  if (JSON.stringify({ data: dataForShared }).length > MAX_SHARED_BODY_SIZE) {
    dataForShared = dataWithoutImages(full);
    imagesOmitted = true;
  }

  const sharedSaved = await saveSharedData(dataForShared);
  if (imagesOmitted) {
    alert("사진 때문에 공유 저장 용량이 커져서, 글/초안은 공유 저장하고 사진은 이 기기 안전백업에만 남겼어요.");
  }

  app.dirty = false;
  $("#saveState").textContent = sharedSaved ? "공유 저장됨" : (localSaved ? "내 기기 저장됨" : "백업 파일 저장됨");
  renderDashboard();
  renderArticleList();
}

function downloadVercelBackup(data = app.fullData) {
  const payload = {
    app: "AstroCourse Studio",
    target: "Vercel v1 static clone",
    exportedAt: new Date().toISOString(),
    data
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "astrocourse-vercel-v1-backup.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function renderAll() {
  renderCourseSelect();
  applyAccessMode();
  renderChapters();
  renderDashboard();
  renderArticleList();
  const first = filteredArticles()[0];
  if (!app.selectedArticleId && first) selectArticle(first.id);
  if (!first) clearEditor();
}

function renderCourseSelect() {
  const select = $("#courseSelect");
  const unlocked = Object.values(app.courses);
  const locked = app.lockedCourses.filter(course => !app.courses[course.id]);
  const allCourses = [...unlocked, ...locked];
  const existing = [...select.options].map(option => option.value).join("|");
  const next = allCourses.map(course => course.id).join("|");
  if (existing !== next) {
    select.innerHTML = "";
    allCourses.forEach(course => {
      const option = document.createElement("option");
      option.value = course.id;
      option.textContent = app.courses[course.id] ? course.title : `${course.title} 🔒`;
      select.appendChild(option);
    });
  }
  select.value = app.currentCourseId;
}

function applyAccessMode() {
  const editableIds = [
    "addChapterBtn",
    "renameChapterBtn",
    "deleteChapterBtn",
    "addArticleBtn",
    "renameArticleBtn",
    "deleteArticleBtn",
    "moveChapterUpBtn",
    "moveChapterDownBtn",
    "renumberChaptersBtn",
    "moveArticleUpBtn",
    "moveArticleDownBtn",
    "moveArticleChapterBtn",
    "renumberArticlesBtn",
    "addManualSource",
    "fetchUrlBtn"
  ];
  editableIds.forEach(id => {
    const element = $(`#${id}`);
    if (element) element.classList.toggle("hidden", app.readOnly);
  });

  $$(".editor input, .editor textarea, .editor select").forEach(element => {
    element.disabled = app.readOnly;
  });
  const upload = $("#imageUploadField");
  if (upload) upload.disabled = app.readOnly;

  $("#courseSelect").disabled = false;
  const saveButton = $("#saveBtn");
  if (saveButton) saveButton.textContent = app.readOnly ? "편집 잠금 해제" : "저장";
}

function renderChapters() {
  const panel = $("#treePanel");
  panel.innerHTML = "";
  chapters().forEach(chapter => {
    const button = document.createElement("button");
    button.className = `chapter-button ${chapter.id === app.selectedChapterId ? "active" : ""}`;
    button.innerHTML = `<span>${chapter.id} ${chapter.title}</span><span class="count">${chapter.articles.length}</span>`;
    button.addEventListener("click", () => {
      collectEditor();
      app.selectedChapterId = chapter.id;
      app.selectedArticleId = "";
      renderChapters();
      renderArticleList();
      const first = filteredArticles()[0];
      if (first) selectArticle(first.id);
      else clearEditor();
    });
    panel.appendChild(button);
  });
}

function renderDashboard() {
  const panel = $("#dashboardPanel");
  panel.innerHTML = "";
  const counts = { idea: 0, research: 0, draft: 0, review: 0, published: 0 };
  const olympiad = [];
  const active = [];
  articles().forEach(article => {
    const state = articleState(article.id);
    counts[state.status] = (counts[state.status] || 0) + 1;
    if (state.olympiad) olympiad.push(article);
    if (["research", "draft", "review"].includes(state.status)) active.push(article);
  });
  panel.appendChild(dashCard(`${currentCourse().title} 상태 요약`, Object.entries(counts).map(([k, v]) => `${statusLabels[k]} ${v}`).join(" · ")));
  panel.appendChild(dashCard("진행 중", active.slice(0, 8).map(a => `${a.id} ${a.title}`).join("\n") || "아직 없음"));
  panel.appendChild(dashCard("풀이 분리 필요", olympiad.slice(0, 8).map(a => `${a.id} ${a.title}`).join("\n") || "아직 없음"));
}

function dashCard(title, body) {
  const button = document.createElement("button");
  button.className = "dash-card";
  button.innerHTML = `<strong>${title}</strong><span>${body.replace(/\n/g, "<br>")}</span>`;
  return button;
}

function filteredArticles() {
  const query = $("#searchInput").value.trim().toLowerCase();
  const status = $("#statusFilter").value;
  return articles().filter(article => {
    const inChapter = !app.selectedChapterId || article.chapterId === app.selectedChapterId || query;
    const haystack = `${article.id} ${article.title} ${article.chapterTitle} ${article.sectionTitle}`.toLowerCase();
    const matchesQuery = !query || haystack.includes(query);
    const matchesStatus = !status || articleState(article.id).status === status;
    return inChapter && matchesQuery && matchesStatus;
  });
}

function renderArticleList() {
  const chapter = selectedChapter();
  $("#chapterTitle").textContent = chapter ? chapter.id + " " + chapter.title : "검색 결과";
  const list = $("#articleList");
  list.innerHTML = "";
  filteredArticles().forEach(article => {
    const state = articleState(article.id);
    const row = document.createElement("div");
    row.className = "article-row " + (article.id === app.selectedArticleId ? "active" : "");

    const idInput = document.createElement("input");
    idInput.className = "article-id-input";
    idInput.value = article.id;
    idInput.disabled = app.readOnly;
    idInput.setAttribute("aria-label", "글 번호");
    let articleIdCommitTimer = null;
    const commitArticleIdInput = (event) => {
      event.stopPropagation();
      clearTimeout(articleIdCommitTimer);
      updateArticleId(article.id, idInput.value.trim());
    };
    idInput.addEventListener("click", event => event.stopPropagation());
    idInput.addEventListener("change", commitArticleIdInput);
    idInput.addEventListener("blur", commitArticleIdInput);
    idInput.addEventListener("keydown", event => {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        commitArticleIdInput(event);
      }
    });
    idInput.addEventListener("input", event => {
      event.stopPropagation();
      clearTimeout(articleIdCommitTimer);
      const value = idInput.value.trim();
      if (/^\d{2,}$/.test(value) || /^\d+\.\d+$/.test(value) || /^[A-Za-z]+\d+\.\d+$/.test(value)) {
        articleIdCommitTimer = setTimeout(() => updateArticleId(article.id, value), 450);
      }
    });

    const info = document.createElement("button");
    info.type = "button";
    info.className = "article-select";
    info.innerHTML = '<span class="article-name"></span><span class="article-sub"></span>';
    info.querySelector(".article-name").textContent = article.title;
    info.querySelector(".article-sub").textContent = statusLabels[state.status] + " · " + (article.sectionTitle || article.chapterTitle);
    info.addEventListener("click", () => selectArticle(article.id));

    row.appendChild(idInput);
    row.appendChild(info);
    list.appendChild(row);
  });
}

function updateArticleId(oldId, nextId) {
  if (app.readOnly) return;
  const article = articles().find(item => item.id === oldId);
  if (!article) return renderArticleList();
  nextId = normalizeArticleIdInput(article, nextId);
  if (!nextId || nextId === oldId) return renderArticleList();
  if (articles().some(item => item.id === nextId)) {
    alert("이미 같은 글 번호가 있습니다.");
    return renderArticleList();
  }
  article.id = nextId;
  migrateArticleStateId(oldId, nextId);
  if (app.selectedArticleId === oldId) app.selectedArticleId = nextId;
  markDirty();
  renderChapters();
  renderDashboard();
  renderArticleList();
  selectArticle(nextId);
  $("#saveState").textContent = "글 번호 변경됨";
}
function selectArticle(id) {
  collectEditor();
  app.selectedArticleId = id;
  const article = selectedArticle();
  if (!article) return clearEditor();
  const state = articleState(id);
  $("#articleMeta").textContent = `${article.id} · ${currentCourse().title} · ${article.chapterTitle}`;
  $("#articleTitle").textContent = article.title;
  $("#articleStatusPill").textContent = statusLabels[state.status];
  $("#statusField").value = state.status;
  $("#priorityField").value = state.priority;
  $("#olympiadField").checked = !!state.olympiad;
  $("#mainBlogField").checked = state.mainBlog !== false;
  $("#questionField").value = state.question || "";
  $("#factsField").value = state.facts || "";
  $("#conceptsField").value = state.concepts || "";
  $("#deferredField").value = state.deferred || "";
  $("#notesField").value = state.notes || "";
  $("#mathField").value = state.math || "";
  $("#problemField").value = state.problem || "";
  $("#solutionLinkField").value = state.solutionLink || "";
  renderSources(state.sources || []);
  renderImages(state.images || []);
  renderArticleList();
}

function clearEditor() {
  app.selectedArticleId = "";
  app.selectedImageId = "";
  $("#articleMeta").textContent = "Article";
  $("#articleTitle").textContent = "글을 선택하세요";
  $("#articleStatusPill").textContent = "대기";
  renderImages([]);
}

function collectEditor() {
  if (!app.selectedArticleId || !selectedArticle()) return;
  const state = articleState(app.selectedArticleId);
  state.status = $("#statusField").value;
  state.priority = $("#priorityField").value;
  state.olympiad = $("#olympiadField").checked;
  state.mainBlog = $("#mainBlogField").checked;
  state.question = $("#questionField").value;
  state.facts = $("#factsField").value;
  state.concepts = $("#conceptsField").value;
  state.deferred = $("#deferredField").value;
  state.notes = $("#notesField").value;
  state.math = $("#mathField").value;
  state.problem = $("#problemField").value;
  state.solutionLink = $("#solutionLinkField").value;
  state.sources = collectSources();
  state.images = currentImages();
  $("#articleStatusPill").textContent = statusLabels[state.status];
}

function currentImages() {
  if (!app.selectedArticleId || !selectedArticle()) return [];
  const state = articleState(app.selectedArticleId);
  if (!Array.isArray(state.images)) state.images = [];
  return state.images;
}

function nextArticleId(chapter) {
  const numeric = chapter.articles
    .map(article => article.id.match(/(\d+)(?:\.(\d+))?$/))
    .filter(Boolean)
    .map(match => Number(match[2] || match[1]))
    .filter(Number.isFinite);
  const next = Math.max(0, ...numeric) + 1;
  if (/^O\d+/.test(chapter.id)) return `${chapter.id}.${String(next).padStart(2, "0")}`;
  const prefix = chapter.id.match(/^(\d+)/)?.[1] || "0";
  return `${prefix}.${String(next).padStart(2, "0")}`;
}

function addArticle() {
  if (app.readOnly) return;
  collectEditor();
  const chapter = selectedChapter();
  if (!chapter) return;
  const title = prompt("추가할 글 제목을 입력하세요.");
  if (!title) return;
  const id = prompt("글 번호를 입력하세요.", nextArticleId(chapter));
  if (!id) return;
  const article = {
    id,
    title,
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    sectionTitle: ""
  };
  chapter.articles.push(article);
  app.selectedArticleId = "";
  markDirty();
  renderChapters();
  renderArticleList();
  selectArticle(id);
}

function renameArticle() {
  if (app.readOnly) return;
  collectEditor();
  const article = selectedArticle();
  if (!article) return;
  const nextTitle = prompt("새 제목을 입력하세요.", article.title);
  if (!nextTitle || nextTitle === article.title) return;
  article.title = nextTitle;
  markDirty();
  renderArticleList();
  selectArticle(article.id);
}

function deleteArticle() {
  if (app.readOnly) return;
  const article = selectedArticle();
  const chapter = selectedChapter();
  if (!article || !chapter) return;
  if (!confirm(`${article.id} ${article.title}\n\n이 글을 목차에서 삭제할까요? 저장 전까지는 새로고침하면 되돌릴 수 있습니다.`)) return;
  chapter.articles = chapter.articles.filter(item => item.id !== article.id);
  delete app.state.articles[stateKey(article.id)];
  app.selectedArticleId = "";
  markDirty();
  renderChapters();
  renderArticleList();
  const first = filteredArticles()[0];
  if (first) selectArticle(first.id);
  else clearEditor();
}

function nextChapterId() {
  const numeric = chapters()
    .map(chapter => chapter.id.match(/^O?(\d+)/))
    .filter(Boolean)
    .map(match => Number(match[1]))
    .filter(Number.isFinite);
  const next = Math.max(-1, ...numeric) + 1;
  return app.currentCourseId === "olympiad" ? `O${next}` : String(next);
}

function addChapter() {
  if (app.readOnly) return;
  collectEditor();
  const title = prompt("새 목차 이름을 입력하세요.");
  if (!title) return;
  const id = prompt("새 목차 번호를 입력하세요.", nextChapterId());
  if (!id) return;
  if (chapters().some(chapter => chapter.id === id)) {
    alert("이미 같은 번호의 목차가 있습니다.");
    return;
  }
  const chapter = {
    id,
    title,
    sections: [],
    articles: []
  };
  currentCourse().chapters.push(chapter);
  app.selectedChapterId = id;
  app.selectedArticleId = "";
  $("#searchInput").value = "";
  markDirty();
  renderChapters();
  renderDashboard();
  renderArticleList();
  clearEditor();
}

function renameChapter() {
  if (app.readOnly) return;
  collectEditor();
  const chapter = selectedChapter();
  if (!chapter) {
    alert("이름을 바꿀 목차를 먼저 선택하세요.");
    return;
  }
  const nextTitle = prompt("새 목차 이름을 입력하세요.", chapter.title);
  if (!nextTitle || nextTitle === chapter.title) return;
  chapter.title = nextTitle;
  (chapter.articles || []).forEach(article => {
    article.chapterTitle = nextTitle;
  });
  markDirty();
  renderChapters();
  renderDashboard();
  renderArticleList();
  if (app.selectedArticleId) selectArticle(app.selectedArticleId);
}

function deleteChapter() {
  if (app.readOnly) return;
  collectEditor();
  const course = currentCourse();
  const chapter = selectedChapter();
  if (!course || !chapter) {
    alert("삭제할 목차를 먼저 선택하세요.");
    return;
  }
  const articleCount = chapter.articles?.length || 0;
  if (!confirm(`${chapter.id} ${chapter.title}\n\n이 목차와 안에 있는 글 ${articleCount}개를 삭제할까요? 저장 전까지는 새로고침하면 되돌릴 수 있습니다.`)) return;
  (chapter.articles || []).forEach(article => {
    delete app.state.articles[stateKey(article.id)];
  });
  const index = course.chapters.findIndex(item => item.id === chapter.id);
  course.chapters = course.chapters.filter(item => item.id !== chapter.id);
  const nextChapter = course.chapters[Math.min(index, course.chapters.length - 1)];
  app.selectedChapterId = nextChapter?.id || "";
  app.selectedArticleId = "";
  markDirty();
  renderChapters();
  renderDashboard();
  renderArticleList();
  const first = filteredArticles()[0];
  if (first) selectArticle(first.id);
  else clearEditor();
}

function moveSelectedChapter(delta) {
  if (app.readOnly) return;
  collectEditor();
  const course = currentCourse();
  const index = chapters().findIndex(chapter => chapter.id === app.selectedChapterId);
  const nextIndex = index + delta;
  if (!course || index < 0) return alert("이동할 챕터를 먼저 선택하세요.");
  if (nextIndex < 0 || nextIndex >= course.chapters.length) return alert("더 이상 이동할 수 없습니다.");
  const item = course.chapters.splice(index, 1)[0];
  course.chapters.splice(nextIndex, 0, item);
  refreshAfterStructureChange();
  $("#saveState").textContent = "챕터 순서 변경됨";
}

function renumberChapters() {
  if (app.readOnly) return;
  collectEditor();
  const course = currentCourse();
  if (!course) return;
  if (!confirm("현재 프로젝트의 모든 챕터와 글 번호를 화면 순서대로 다시 매길까요?")) return;
  const prefix = app.currentCourseId === "book" ? "B" : app.currentCourseId === "olympiad" ? "O" : "";
  course.chapters.forEach((chapter, index) => {
    const oldId = chapter.id;
    const nextId = prefix + index;
    chapter.id = nextId;
    (chapter.articles || []).forEach(article => {
      article.chapterId = nextId;
      article.chapterTitle = chapter.title;
    });
    if (app.selectedChapterId === oldId) app.selectedChapterId = nextId;
    renumberArticlesInChapter(chapter);
  });
  refreshAfterStructureChange();
  $("#saveState").textContent = "챕터/글 순번 정리됨";
}

function moveSelectedArticle(delta) {
  if (app.readOnly) return;
  collectEditor();
  const chapter = selectedChapter();
  if (!chapter) return alert("글이 속한 챕터를 먼저 선택하세요.");
  const index = chapter.articles.findIndex(article => article.id === app.selectedArticleId);
  const nextIndex = index + delta;
  if (index < 0) return alert("이동할 글을 먼저 선택하세요.");
  if (nextIndex < 0 || nextIndex >= chapter.articles.length) return alert("더 이상 이동할 수 없습니다.");
  const item = chapter.articles.splice(index, 1)[0];
  chapter.articles.splice(nextIndex, 0, item);
  renumberArticlesInChapter(chapter);
  refreshAfterStructureChange();
  $("#saveState").textContent = "글 순서/번호 변경됨";
}

function moveArticleToChapter() {
  if (app.readOnly) return;
  collectEditor();
  const article = selectedArticle();
  const source = selectedChapter();
  if (!article || !source) return;
  const options = chapters().map((chapter, index) => (index + 1) + ". " + chapter.id + " " + chapter.title).join("\n");
  const raw = prompt("이동할 챕터 번호를 입력하세요:\n\n" + options);
  if (!raw) return;
  const target = chapters()[Number(raw) - 1] || chapters().find(chapter => chapter.id === raw.trim());
  if (!target || target.id === source.id) return;
  const newId = prompt("이동 후 글 번호를 입력하세요", nextArticleId(target));
  if (!newId) return;
  source.articles = source.articles.filter(item => item.id !== article.id);
  const oldId = article.id;
  article.id = newId;
  article.chapterId = target.id;
  article.chapterTitle = target.title;
  article.sectionTitle = "";
  target.articles.push(article);
  migrateArticleStateId(oldId, newId);
  app.selectedChapterId = target.id;
  app.selectedArticleId = newId;
  refreshAfterStructureChange();
}

function renumberSelectedArticles() {
  if (app.readOnly) return;
  collectEditor();
  const chapter = selectedChapter();
  if (!chapter) return alert("순번을 정리할 챕터를 먼저 선택하세요.");
  if (!confirm(chapter.id + " " + chapter.title + " 안의 글 번호를 화면 순서대로 다시 매길까요?")) return;
  renumberArticlesInChapter(chapter);
  refreshAfterStructureChange();
  $("#saveState").textContent = "글 순번 정리됨";
}
function renderSources(sources) {
  const list = $("#sourcesList");
  list.innerHTML = "";
  sources.forEach(source => addSourceCard(source));
}

function collectSources() {
  return $$(".source-card").map(card => ({
    title: card.querySelector(".source-title").value,
    url: card.querySelector(".source-url").value,
    note: card.querySelector(".source-note").value
  }));
}

function addSourceCard(source = {}) {
  const node = $("#sourceTemplate").content.firstElementChild.cloneNode(true);
  node.querySelector(".source-title").value = source.title || "";
  node.querySelector(".source-url").value = source.url || "";
  node.querySelector(".source-note").value = source.note || "";
  node.querySelector(".remove-source").addEventListener("click", () => {
    if (app.readOnly) return;
    node.remove();
    markDirty();
  });
  node.querySelector(".remove-source").classList.toggle("hidden", app.readOnly);
  node.querySelectorAll("input, textarea").forEach(input => {
    input.disabled = app.readOnly;
  });
  node.addEventListener("input", markDirty);
  $("#sourcesList").appendChild(node);
}

function renderImages(images) {
  const gallery = $("#imageGallery");
  if (!gallery) return;
  gallery.innerHTML = "";
  app.selectedImageId = images.some(image => image.id === app.selectedImageId) ? app.selectedImageId : "";

  images.forEach(image => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `image-tile ${image.id === app.selectedImageId ? "active" : ""}`;
    button.innerHTML = `<img src="${image.dataUrl}" alt="${image.name || "uploaded image"}"><span>${image.name || "사진"}</span>`;
    button.addEventListener("click", () => {
      app.selectedImageId = image.id;
      renderImages(currentImages());
    });
    gallery.appendChild(button);
  });

  renderImageActions();
}

function renderImageActions() {
  const actions = $("#imageActions");
  if (!actions) return;
  const image = currentImages().find(item => item.id === app.selectedImageId);
  actions.classList.toggle("hidden", !image);
  $("#selectedImageName").textContent = image ? image.name || "사진 선택됨" : "사진 선택됨";
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });
}

async function compressImageFile(file) {
  const original = await readFileAsDataUrl(file);
  if (original.length <= MAX_IMAGE_DATA_URL_SIZE) return original;
  const image = await loadImageFromDataUrl(original);
  const maxWidth = 1200;
  const scale = Math.min(1, maxWidth / image.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  let quality = 0.72;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (dataUrl.length > MAX_IMAGE_DATA_URL_SIZE && quality > 0.38) {
    quality -= 0.08;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  if (dataUrl.length > MAX_IMAGE_DATA_URL_SIZE) {
    throw new Error(file.name + " 파일이 너무 큽니다. 캡처 영역을 줄이거나 사진을 압축해서 다시 올려주세요.");
  }
  return dataUrl;
}

async function addImages(files) {
  if (app.readOnly) return;
  if (!app.selectedArticleId || !selectedArticle()) {
    alert("사진을 넣을 글을 먼저 선택하세요.");
    return;
  }
  const images = currentImages();
  for (const file of [...files]) {
    if (!file.type.startsWith("image/")) continue;
    try {
      const dataUrl = await compressImageFile(file);
      images.push({
        id: Date.now() + "-" + Math.random().toString(16).slice(2),
        name: file.name,
        type: "image/jpeg",
        dataUrl
      });
      markDirty();
      renderImages(images);
      scheduleSafetyBackup();
    } catch (error) {
      alert(error.message || "사진 업로드에 실패했습니다.");
    }
  }
}
function editSelectedImage() {
  if (app.readOnly) return;
  const image = currentImages().find(item => item.id === app.selectedImageId);
  if (!image) return;
  const nextName = prompt("사진 이름을 입력하세요.", image.name || "사진");
  if (!nextName) return;
  image.name = nextName;
  markDirty();
  renderImages(currentImages());
}

function deleteSelectedImage() {
  if (app.readOnly) return;
  const images = currentImages();
  const image = images.find(item => item.id === app.selectedImageId);
  if (!image) return;
  if (!confirm(`${image.name || "사진"}\n\n이 사진을 삭제할까요?`)) return;
  const state = articleState(app.selectedArticleId);
  state.images = images.filter(item => item.id !== image.id);
  app.selectedImageId = "";
  markDirty();
  renderImages(state.images);
}

function switchTab(tab) {
  $$(".tab").forEach(button => button.classList.toggle("active", button.dataset.tab === tab));
  $("#planTab").classList.toggle("hidden", tab !== "plan");
  $("#sourcesTab").classList.toggle("hidden", tab !== "sources");
  $("#olympiadTab").classList.toggle("hidden", tab !== "olympiad");
}

function switchMode(mode) {
  app.mode = mode;
  $("#treeMode").classList.toggle("active", mode === "tree");
  $("#dashMode").classList.toggle("active", mode === "dashboard");
  $("#treeTools").classList.toggle("hidden", mode !== "tree");
  $("#treePanel").classList.toggle("hidden", mode !== "tree");
  $("#dashboardPanel").classList.toggle("hidden", mode !== "dashboard");
}

async function fetchSource() {
  if (app.readOnly) return;
  const url = $("#fetchUrlField").value.trim();
  if (!url) return;
  addSourceCard({
    title: url,
    url,
    note: "Vercel 정적 배포판에서는 외부 페이지 자동 읽기 대신 URL을 자료 카드로 저장합니다."
  });
  $("#fetchUrlField").value = "";
  markDirty();
}

function switchCourse(courseId) {
  if (lockedCourse(courseId)) {
    const password = prompt("이 탭은 비밀번호가 필요합니다.");
    if (password !== VERCEL_PASSWORD) {
      alert("비밀번호가 맞지 않습니다.");
      renderCourseSelect();
      return;
    }
    sessionStorage.setItem("astrocourse.vercelV1.owner", "true");
    const params = new URLSearchParams(location.search);
    params.set("token", VERCEL_PASSWORD);
    params.set("course", courseId);
    location.href = `${location.pathname}?${params.toString()}`;
    return;
  }
  collectEditor();
  app.currentCourseId = courseId;
  app.state.settings = app.state.settings || {};
  app.state.settings.currentCourseId = courseId;
  app.selectedChapterId = chapters()[0]?.id || "";
  app.selectedArticleId = "";
  $("#searchInput").value = "";
  renderAll();
}

function normalizeActionLabels() {
  const labels = {
    addChapterBtn: "목차+",
    renameChapterBtn: "이름",
    deleteChapterBtn: "삭제",
    moveChapterUpBtn: "↑",
    moveChapterDownBtn: "↓",
    renumberChaptersBtn: "순번",
    addArticleBtn: "글+",
    renameArticleBtn: "제목",
    deleteArticleBtn: "삭제",
    moveArticleUpBtn: "↑",
    moveArticleDownBtn: "↓",
    moveArticleChapterBtn: "이동",
    renumberArticlesBtn: "순번"
  };
  Object.entries(labels).forEach(([id, label]) => {
    const element = $("#" + id);
    if (element) element.textContent = label;
  });
}
function bindEvents() {
  $("#saveBtn").addEventListener("click", () => app.readOnly ? unlockEditing() : save().catch(error => alert(error.message)));
  $("#courseSelect").addEventListener("change", event => {
    switchCourse(event.target.value);
    markDirty();
  });
  $("#treeMode").addEventListener("click", () => switchMode("tree"));
  $("#dashMode").addEventListener("click", () => switchMode("dashboard"));
  $("#addChapterBtn").addEventListener("click", addChapter);
  $("#renameChapterBtn").addEventListener("click", renameChapter);
  $("#deleteChapterBtn").addEventListener("click", deleteChapter);
  $("#moveChapterUpBtn")?.addEventListener("click", () => moveSelectedChapter(-1));
  $("#moveChapterDownBtn")?.addEventListener("click", () => moveSelectedChapter(1));
  $("#renumberChaptersBtn")?.addEventListener("click", renumberChapters);
  $("#addArticleBtn").addEventListener("click", addArticle);
  $("#renameArticleBtn").addEventListener("click", renameArticle);
  $("#deleteArticleBtn").addEventListener("click", deleteArticle);
  $("#moveArticleUpBtn")?.addEventListener("click", () => moveSelectedArticle(-1));
  $("#moveArticleDownBtn")?.addEventListener("click", () => moveSelectedArticle(1));
  $("#moveArticleChapterBtn")?.addEventListener("click", moveArticleToChapter);
  $("#renumberArticlesBtn")?.addEventListener("click", renumberSelectedArticles);
  $("#searchInput").addEventListener("input", () => {
    app.selectedChapterId = "";
    renderChapters();
    renderArticleList();
  });
  $("#statusFilter").addEventListener("change", renderArticleList);
  $$(".tab").forEach(button => button.addEventListener("click", () => switchTab(button.dataset.tab)));
  $("#addManualSource").addEventListener("click", () => {
    addSourceCard();
    markDirty();
  });
  $("#fetchUrlBtn").addEventListener("click", fetchSource);
  $("#imageUploadField").addEventListener("change", event => {
    addImages(event.target.files || []);
    event.target.value = "";
  });
  $("#editImageBtn").addEventListener("click", editSelectedImage);
  $("#deleteImageBtn").addEventListener("click", deleteSelectedImage);
  $(".editor").addEventListener("input", () => { markDirty(); scheduleSafetyBackup(); });
  $(".editor").addEventListener("change", () => { markDirty(); scheduleSafetyBackup(); });
  window.addEventListener("beforeunload", (event) => {
    if (!app.dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });
}

normalizeActionLabels();
bindEvents();
load().catch(error => {
  $("#saveState").textContent = "오류";
  alert(error.message);
});

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
