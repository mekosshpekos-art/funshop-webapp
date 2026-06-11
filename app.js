/**
 * app.js — FunShop WebApp Logic
 * Полностью независим от бота. Работает через Telegram WebApp API.
 * Данные каталога хранятся в data.js (статический JSON).
 * Заказ отправляется через Telegram.sendData() или REST API.
 */

/* ═══════════════════════════════════════════════════════
   КОНФИГУРАЦИЯ (URL бэкенда — если используется)
   Если WebApp на GitHub Pages, данные берутся из CATALOG ниже
   ═══════════════════════════════════════════════════════ */
const API_BASE = window.location.hostname.endsWith("github.io") ? "https://prevail-blah-shrubbery.ngrok-free.dev" : (window.location.origin && window.location.origin !== "null" && !window.location.origin.startsWith("file://") ? window.location.origin : "");

/* ═══════════════════════════════════════════════════════
   ВСТРОЕННЫЙ КАТАЛОГ (перенесён из старого проекта)
   Если есть бэкенд (API_BASE), данные загружаются оттуда.
   Иначе — используется этот статический каталог.
   ═══════════════════════════════════════════════════════ */
const STATIC_CATALOG = {
  categories: [
    { id: 1, name: "Снюс",       slug: "snus"        },
    { id: 2, name: "Расходники",  slug: "rashodniki"  },
    { id: 3, name: "Кальян",     slug: "hookah"      },
    { id: 4, name: "Одноразки",   slug: "disposables" },
    { id: 5, name: "Поды",        slug: "pods"        },
  ],
  products: [
    // ── Снюс ─────────────────────────────────────────────
    { id: 1,  category_id: 1, name: "Snus Cuba Black Cherry",   price: 4500, image_url: "", description: "Снюс Cuba с ароматом чёрной вишни" },
    { id: 2,  category_id: 1, name: "Snus Pablo Ice Cold",      price: 4500, image_url: "", description: "Снюс Pablo с ледяным эффектом"     },
    { id: 3,  category_id: 1, name: "Snus Velo Freeze X-Strong",price: 4500, image_url: "", description: "Снюс Velo максимальной крепости"    },
    { id: 4,  category_id: 1, name: "Snus Iceberg Watermelon",  price: 4500, image_url: "", description: "Снюс Iceberg со вкусом арбуза"      },
    // ── Расходники ─────────────────────────────────────────
    { id: 5,  category_id: 2, name: "Испаритель B Series Hero/Boost", price: 2500, image_url: "", description: "Испаритель серии B для Hero/Boost" },
    // ── Кальян ───────────────────────────────────────────
    { id: 6,  category_id: 3, name: "Кальян Premium Hookah",    price: 10000, image_url: "", description: "Премиальный кальян для ценителей"  },
  ]
};

/* ═══════════════════════════════════════════════════════
   ГЛОБАЛЬНОЕ СОСТОЯНИЕ
   ═══════════════════════════════════════════════════════ */
let state = {
  categories: [],
  products:   [],
  cart:       [],            // [{product_id, name, price, quantity}]
  activeCategory: 'all',
  searchQuery: '',
  user: null,
  userRole: 'client',        // 'admin' | 'manager' | 'client'
  delivery: {
    type:  'city',
    price: 700,
  },
  isSubmitting: false,
  // ID персонала (загружается из /api/config или задаётся здесь)
  adminIds:   [8848228870],
  managerIds: [8965924831, 7995137347],
};

/* ═══════════════════════════════════════════════════════
   TELEGRAM WEBAPP SDK
   ═══════════════════════════════════════════════════════ */
const tg = window.Telegram?.WebApp;

function initTelegram() {
  if (!tg) {
    console.warn('Telegram WebApp SDK не найден. Работаем в браузерном режиме.');
    return;
  }
  window.Telegram.WebApp.ready();
  tg.expand();

  try {
    tg.setHeaderColor('#0e1621');
    tg.setBackgroundColor('#0e1621');
  } catch (e) {}

  if (tg.initDataUnsafe?.user) {
    state.user = tg.initDataUnsafe.user;
  }
}

function triggerHaptic(type = 'light') {
  try {
    if (!tg?.HapticFeedback) return;
    if (type === 'success') tg.HapticFeedback.notificationOccurred('success');
    else if (type === 'warning') tg.HapticFeedback.notificationOccurred('warning');
    else tg.HapticFeedback.impactOccurred(type);
  } catch (e) {}
}

/* ═══════════════════════════════════════════════════════
   ОПРЕДЕЛЕНИЕ РОЛИ ПОЛЬЗОВАТЕЛЯ
   ═══════════════════════════════════════════════════════ */
function detectRole() {
  if (!state.user) return;
  const uid = state.user.id;
  if (state.adminIds.includes(uid)) {
    state.userRole = 'admin';
  } else if (state.managerIds.includes(uid)) {
    state.userRole = 'manager';
  } else {
    state.userRole = 'client';
  }
}

function isStaff() {
  return state.userRole === 'admin' || state.userRole === 'manager';
}

/* ═══════════════════════════════════════════════════════
   ЗАГРУЗКА ДАННЫХ
   ═══════════════════════════════════════════════════════ */
async function loadCatalog() {
  if (API_BASE) {
    try {
      const [catRes, prodRes] = await Promise.all([
        fetch(`${API_BASE}/api/categories`),
        fetch(`${API_BASE}/api/products`),
      ]);
      state.categories = await catRes.json();
      state.products   = await prodRes.json();
      return;
    } catch (e) {
      console.warn('Ошибка загрузки с бэкенда, используем встроенный каталог:', e);
    }
  }
  state.categories = STATIC_CATALOG.categories;
  state.products   = STATIC_CATALOG.products;
}

async function loadConfig() {
  if (!API_BASE) return;
  try {
    const res  = await fetch(`${API_BASE}/api/config`);
    const data = await res.json();
    if (data.admin_ids)   state.adminIds   = data.admin_ids;
    if (data.manager_ids) state.managerIds = data.manager_ids;

  } catch (e) {
    console.warn('Конфиг не загружен, используем встроенные ID');
  }
}

/* ═══════════════════════════════════════════════════════
   РЕНДЕРИНГ
   ═══════════════════════════════════════════════════════ */
function renderHeader() {
  const nameEl = document.getElementById('user-name');
  nameEl.textContent = state.user?.first_name || 'Гость';

  const adminBtn = document.getElementById('admin-btn');
  if (isStaff()) {
    adminBtn.classList.remove('hidden');
  }
}

function renderCategories() {
  const container = document.getElementById('categories-list');
  const allBtn = container.querySelector('[data-id="all"]');
  container.innerHTML = '';
  container.appendChild(allBtn);

  state.categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'cat-btn';
    btn.dataset.id = cat.id;
    btn.textContent = cat.name;
    btn.onclick = () => selectCategory(cat.id, btn);
    container.appendChild(btn);
  });

  const select = document.getElementById('new-category');
  if (select) {
    select.innerHTML = '<option value="" disabled selected>Выберите категорию...</option>';
    state.categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.name;
      select.appendChild(opt);
    });
  }
}

function getFilteredProducts() {
  return state.products.filter(p => {
    const matchCat = state.activeCategory === 'all' || p.category_id === state.activeCategory;
    const matchSearch = p.name.toLowerCase().includes(state.searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });
}

function renderProducts() {
  const grid = document.getElementById('products-grid');
  const countEl = document.getElementById('product-count');
  const filtered = getFilteredProducts();

  countEl.textContent = `${filtered.length} товаров`;

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <p>Товары не найдены 🔍</p>
      </div>`;
    return;
  }

  grid.innerHTML = filtered.map(p => buildProductCard(p)).join('');
}

function buildProductCard(p) {
  const qty = getItemQty(p.id);
  const imgHtml = p.image_url
    ? `<img class="product-img" src="${escHtml(p.image_url)}" alt="${escHtml(p.name)}" onerror="this.parentElement.innerHTML=noImageHtml()" loading="lazy" />`
    : `<div class="product-img-placeholder"><span>📦</span><span>FunShop Premium</span></div>`;

  let actionHtml = "";
  if (isStaff()) {
    actionHtml = `
      <div class="staff-actions">
        <button class="btn-edit" onclick="editProduct(${p.id})">✏️</button>
        <button class="btn-delete" onclick="deleteProduct(${p.id})">🗑</button>
      </div>`;
  } else {
    actionHtml = qty > 0
      ? `<div class="qty-counter">
           <button class="qty-btn" onclick="updateQty(${p.id}, -1)">−</button>
           <span class="qty-value">${qty}</span>
           <button class="qty-btn" onclick="updateQty(${p.id}, 1)">+</button>
         </div>`
      : `<button class="btn-add" onclick="addToCart(${p.id})">+</button>`;
  }

  return `
    <div class="product-card" id="card-${p.id}">
      <div class="product-img-wrap">${imgHtml}</div>
      <div class="product-body">
        <div>
          <h3 class="product-name">${escHtml(p.name)}</h3>
          <p class="product-quality">Гарантия качества 100%</p>
        </div>
        <div class="product-footer">
          <span class="product-price">${formatPrice(p.price)}</span>
          ${actionHtml}
        </div>
      </div>
    </div>`;
}

function noImageHtml() {
  return `<div class="product-img-placeholder"><span>📦</span><span>FunShop Premium</span></div>`;
}

/* ═══════════════════════════════════════════════════════
   КОРЗИНА
   ═══════════════════════════════════════════════════════ */
function getItemQty(productId) {
  return state.cart.find(i => i.product_id === productId)?.quantity || 0;
}

function addToCart(productId) {
  const product = state.products.find(p => p.id === productId);
  if (!product) return;

  const existing = state.cart.find(i => i.product_id === productId);
  if (existing) {
    existing.quantity += 1;
  } else {
    state.cart.push({ product_id: productId, name: product.name, price: product.price, quantity: 1 });
  }
  triggerHaptic('success');
  updateCartFab();
  
  const card = document.getElementById(`card-${productId}`);
  if (card) {
    const footer = card.querySelector('.product-footer');
    if (footer) {
      footer.querySelector('.btn-add, .qty-counter').outerHTML = buildProductCard(product).match(/(<div class="qty-counter">[\s\S]*?<\/div>|<button class="btn-add"[^>]*>[^<]*<\/button>)/)?.[0] || '';
      renderProducts();
    }
  }
}

function updateQty(productId, delta) {
  const item = state.cart.find(i => i.product_id === productId);
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) {
    state.cart = state.cart.filter(i => i.product_id !== productId);
  }
  triggerHaptic('light');
  updateCartFab();
  renderProducts();

  if (!document.getElementById('cart-modal').classList.contains('hidden')) {
    renderCartItems();
    updateCartTotals();
    updateCheckoutBtn();
  }
}

function removeFromCart(productId) {
  state.cart = state.cart.filter(i => i.product_id !== productId);
  triggerHaptic('warning');
  updateCartFab();
  renderProducts();
  renderCartItems();
  updateCartTotals();
  updateCheckoutBtn();
}

function getCartSubtotal() {
  return state.cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
}

function getTotalCount() {
  return state.cart.reduce((sum, i) => sum + i.quantity, 0);
}

function updateCartFab() {
  const fab = document.getElementById('cart-fab');
  const count = getTotalCount();
  if (count === 0) {
    fab.classList.add('hidden');
    return;
  }
  fab.classList.remove('hidden');
  document.getElementById('cart-count-text').textContent = `${count} ${pluralizeGoods(count)}`;
  document.getElementById('cart-fab-price').textContent = formatPrice(getCartSubtotal());
}

/* ═══════════════════════════════════════════════════════
   КОРЗИНА — МОДАЛКА
   ═══════════════════════════════════════════════════════ */
function openCart() {
  renderCartItems();
  updateCartTotals();
  updateCheckoutBtn();
  openModal('cart-modal');
}

function renderCartItems() {
  const container = document.getElementById('cart-items-list');
  if (state.cart.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:var(--muted);font-size:12px;padding:20px 0">Корзина пуста</p>';
    return;
  }
  container.innerHTML = state.cart.map(item => `
    <div class="cart-item">
      <div class="cart-item-info">
        <div class="cart-item-name">${escHtml(item.name)}</div>
        <div class="cart-item-price">${formatPrice(item.price)} / шт</div>
      </div>
      <div class="cart-item-actions">
        <div class="qty-counter">
          <button class="qty-btn" onclick="updateQty(${item.product_id},-1)">−</button>
          <span class="qty-value">${item.quantity}</span>
          <button class="qty-btn" onclick="updateQty(${item.product_id},1)">+</button>
        </div>
        <button class="btn-remove" onclick="removeFromCart(${item.product_id})">🗑</button>
      </div>
    </div>`).join('');
}

function selectDelivery(type, price) {
  state.delivery.type  = type;
  state.delivery.price = price;

  document.getElementById('del-city').classList.remove('active-city');
  document.getElementById('del-suburb').classList.remove('active-suburb');

  if (type === 'city')   document.getElementById('del-city').classList.add('active-city');
  if (type === 'suburb') document.getElementById('del-suburb').classList.add('active-suburb');

  updateCartTotals();
}

function updateCartTotals() {
  const subtotal = getCartSubtotal();
  document.getElementById('total-items-price').textContent    = formatPrice(subtotal);
  document.getElementById('total-delivery-price').textContent = formatPrice(state.delivery.price);
  document.getElementById('total-final-price').textContent    = formatPrice(subtotal + state.delivery.price);
}

function updateCheckoutBtn() {
  const address = document.getElementById('delivery-address')?.value?.trim();
  const btn = document.getElementById('checkout-btn');
  if (!btn) return;
  if (address && state.cart.length > 0) {
    btn.classList.remove('disabled');
  } else {
    btn.classList.add('disabled');
  }
}

/* ═══════════════════════════════════════════════════════
   ОФОРМЛЕНИЕ ЗАКАЗА
   ═══════════════════════════════════════════════════════ */
async function submitOrder() {
  if (state.isSubmitting) return;
  const btn = document.getElementById('checkout-btn');
  if (btn?.classList.contains('disabled')) return;

  const address = document.getElementById('delivery-address').value.trim();
  const comment = document.getElementById('delivery-comment').value.trim();

  if (!address) {
    alert('Укажите адрес доставки!');
    return;
  }
  if (state.cart.length === 0) {
    alert('Корзина пуста!');
    return;
  }

  state.isSubmitting = true;
  if (btn) { btn.textContent = 'Оформление...'; btn.classList.add('disabled'); }

  const payload = {
    type: 'order',
    items: state.cart.map(i => ({ product_id: i.product_id, quantity: i.quantity })),
    delivery_type:  state.delivery.type,
    delivery_price: state.delivery.price,
    address,
    comment,
    user: state.user,
  };

  console.log("WebApp order checkout triggered, payload:", payload);

  if (API_BASE) {
    try {
      const res = await fetch(`${API_BASE}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, initData: tg?.initData || '' }),
      });
      const data = await res.json();
      if (data.success) {
        state.cart = [];
        closeModal('cart-modal');
        showSuccessScreen();
      } else {
        alert('Ошибка: ' + (data.detail || data.error || 'Неизвестная ошибка'));
      }
    } catch (e) {
      alert('Ошибка отправки заказа: ' + e.message);
    }
  } else if (window.Telegram?.WebApp && window.Telegram.WebApp.sendData) {
    try {
      window.Telegram.WebApp.sendData(JSON.stringify(payload));
      state.cart = [];
      closeModal('cart-modal');
      showSuccessScreen();
    } catch (err) {
      alert('Ошибка Telegram: ' + err.message);
    }
  } else {
    state.cart = [];
    closeModal('cart-modal');
    showSuccessScreen();
  }

  state.isSubmitting = false;
  if (btn) { btn.textContent = 'Подтвердить заказ'; updateCheckoutBtn(); }
}

function showSuccessScreen() {
  triggerHaptic('success');
  updateCartFab();
  openModal('success-modal');
}

/* ═══════════════════════════════════════════════════════
   ПАНЕЛЬ ADMIN
   ═══════════════════════════════════════════════════════ */
function openAdminPanel() {
  if (!isStaff()) return;
  openModal('admin-modal');
}

let currentPhotoBase64 = "";

function setUploadPreview(src) {
  currentPhotoBase64 = src;
  const preview = document.getElementById('upload-preview');
  const placeholder = document.getElementById('upload-placeholder');
  const removeBtn = document.getElementById('btn-remove-photo');
  
  if (src) {
    preview.src = src;
    preview.classList.remove('hidden');
    placeholder.classList.add('hidden');
    removeBtn.classList.remove('hidden');
  } else {
    preview.src = "";
    preview.classList.add('hidden');
    placeholder.classList.remove('hidden');
    removeBtn.classList.add('hidden');
  }
}

function clearUploadZone() {
  setUploadPreview("");
  const fileInput = document.getElementById('new-image-file');
  if (fileInput) fileInput.value = "";
}

function initPhotoUpload() {
  const fileInput = document.getElementById('new-image-file');
  if (!fileInput) return;

  fileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Пожалуйста, выберите изображение');
      return;
    }

    const reader = new FileReader();
    reader.onload = function(event) {
      const img = new Image();
      img.onload = function() {
        const maxDim = 800;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
        setUploadPreview(compressedBase64);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });

  const removeBtn = document.getElementById('btn-remove-photo');
  if (removeBtn) {
    removeBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      clearUploadZone();
    });
  }
}

function closeAdminModal() {
  document.getElementById('admin-form').reset();
  delete document.getElementById('admin-form').dataset.editId;
  document.querySelector('#admin-modal .modal-title').textContent = '⚙️ Добавить товар';
  document.querySelector('#admin-modal button[type="submit"]').textContent = 'Добавить товар';
  clearUploadZone();
  closeModal('admin-modal');
}

function editProduct(productId) {
  const p = state.products.find(prod => prod.id === productId);
  if (!p) return;

  document.getElementById('new-category').value = p.category_id;
  document.getElementById('new-name').value = p.name;
  document.getElementById('new-price').value = p.price;
  setUploadPreview(p.image_url || "");
  document.getElementById('new-desc').value = p.description || '';

  document.getElementById('admin-form').dataset.editId = productId;
  document.querySelector('#admin-modal .modal-title').textContent = '⚙️ Редактировать товар';
  document.querySelector('#admin-modal button[type="submit"]').textContent = 'Сохранить';

  openModal('admin-modal');
}

async function deleteProduct(productId) {
  const p = state.products.find(prod => prod.id === productId);
  if (!p) return;

  if (!confirm(`Вы действительно хотите удалить товар «${p.name}»?`)) return;

  if (API_BASE) {
    try {
      const res = await fetch(`${API_BASE}/api/products/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initData: tg?.initData || '',
          id: productId,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Access denied');
      }
      // Перезагружаем каталог с сервера для синхронизации у всех
      await loadCatalog();
    } catch (e) {
      alert('Ошибка удаления товара: ' + e.message);
      return;
    }
  } else {
    state.products = state.products.filter(prod => prod.id !== productId);
  }

  renderProducts();
  triggerHaptic('warning');
}

async function submitNewProduct(event) {
  event.preventDefault();
  const form = document.getElementById('admin-form');
  const submitBtn = form.querySelector('button[type="submit"]');
  const editId = form.dataset.editId ? parseInt(form.dataset.editId) : null;

  const categoryId = parseInt(document.getElementById('new-category').value);
  const name       = document.getElementById('new-name').value.trim();
  const price      = parseFloat(document.getElementById('new-price').value);
  const imageUrl   = currentPhotoBase64;
  const desc       = document.getElementById('new-desc').value.trim();

  if (!name || !price || !categoryId) {
    alert('Заполните название, цену и категорию!');
    return;
  }

  // Индикатор загрузки
  const originalText = submitBtn.textContent;
  submitBtn.textContent = '⏳ Загрузка...';
  submitBtn.disabled = true;

  const resetBtn = () => {
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  };

  if (editId) {
    if (API_BASE) {
      try {
        const res = await fetch(`${API_BASE}/api/products/edit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            initData: tg?.initData || '',
            id: editId,
            category_id: categoryId,
            name, price, image_url: imageUrl, description: desc,
          }),
        });
        const resData = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(resData.error || `Ошибка ${res.status}`);
        }
      } catch (e) {
        resetBtn();
        alert('❌ Ошибка изменения товара:\n' + e.message);
        return;
      }
    } else {
      const idx = state.products.findIndex(p => p.id === editId);
      if (idx !== -1) {
        state.products[idx] = { id: editId, category_id: categoryId, name, price, image_url: imageUrl, description: desc };
      }
    }
  } else {
    if (API_BASE) {
      try {
        const res = await fetch(`${API_BASE}/api/products`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            initData: tg?.initData || '',
            category_id: categoryId,
            name, price, image_url: imageUrl, description: desc,
          }),
        });
        const resData = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(resData.error || `Ошибка ${res.status}`);
        }
      } catch (e) {
        resetBtn();
        alert('❌ Ошибка добавления товара:\n' + e.message);
        return;
      }
    } else {
      const newId = Math.max(...state.products.map(p => p.id), 0) + 1;
      state.products.push({ id: newId, category_id: categoryId, name, price, image_url: imageUrl, description: desc });
    }
  }

  // Перезагружаем каталог с сервера, чтобы все пользователи видели актуальные товары
  if (API_BASE) await loadCatalog();

  resetBtn();
  closeAdminModal();
  renderProducts();
  triggerHaptic('success');
}

/* ═══════════════════════════════════════════════════════
   ФИЛЬТРЫ
   ═══════════════════════════════════════════════════════ */
function selectCategory(catId, btn) {
  state.activeCategory = catId === 'all' ? 'all' : parseInt(catId);
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderProducts();
}

function filterProducts() {
  state.searchQuery = document.getElementById('search-input').value;
  renderProducts();
}

/* ═══════════════════════════════════════════════════════
   МОДАЛЬНЫЕ ОКНА
   ═══════════════════════════════════════════════════════ */
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

function closeOnBackdrop(event, modalId) {
  if (event.target.id === modalId) {
    if (modalId === 'admin-modal') closeAdminModal();
    else closeModal(modalId);
  }
}

function closeApp() {
  if (tg) tg.close();
  else closeModal('success-modal');
}

/* ═══════════════════════════════════════════════════════
   УТИЛИТЫ
   ═══════════════════════════════════════════════════════ */
function formatPrice(val) {
  return parseFloat(val).toLocaleString('ru-RU') + ' ₸';
}

function pluralizeGoods(n) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'товар';
  if ([2,3,4].includes(m10) && ![12,13,14].includes(m100)) return 'товара';
  return 'товаров';
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ═══════════════════════════════════════════════════════
   ИНИЦИАЛИЗАЦИЯ
   ═══════════════════════════════════════════════════════ */
async function init() {
  initTelegram();
  await loadConfig();
  detectRole();
  await loadCatalog();

  renderHeader();
  renderCategories();
  renderProducts();
  updateCartFab();
  initPhotoUpload();

  // Инициализируем доставку
  selectDelivery('city', 700);
}

document.addEventListener('DOMContentLoaded', init);
