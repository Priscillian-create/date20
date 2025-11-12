// Service Worker & Supabase Init
if ('serviceWorker' in navigator && !window.location.hostname.includes('stackblitz')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js')
        .then(registration => console.log('ServiceWorker registered:', registration.scope))
        .catch(err => console.log('ServiceWorker registration failed:', err))
    );
}

const supabase = window.supabase.createClient(
    'https://ieriphdzlbuzqqwrymwn.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllcmlwaGR6bGJ1enFxd3J5bXduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzMDU1MTgsImV4cCI6MjA3Nzg4MTUxOH0.bvbs6joSxf1u9U8SlaAYmjve-N6ArNYcNMtnG6-N_HU'
);

// Global State
const state = {
    products: [], cart: [], sales: [], deletedSales: [], users: [], currentUser: null,
    expenses: [], purchases: [], stockAlerts: [], profitData: [],
    currentPage: "pos", isOnline: navigator.onLine, syncQueue: [],
    connectionRetryCount: 0, MAX_RETRY_ATTEMPTS: 3, RETRY_DELAY: 5000,
    settings: {
        storeName: "Pa Gerrys Mart", storeAddress: "Alatishe, Ibeju Lekki, Lagos State, Nigeria",
        storePhone: "+2347037850121", lowStockThreshold: 10, expiryWarningDays: 90
    },
    expenseCategories: ['Rent', 'Utilities', 'Salaries', 'Supplies', 'Marketing', 'Maintenance', 'Other'],
    STORAGE_KEYS: {
        PRODUCTS: 'pagerrysmart_products', SALES: 'pagerrysmart_sales', DELETED_SALES: 'pagerrysmart_deleted_sales',
        USERS: 'pagerrysmart_users', SETTINGS: 'pagerrysmart_settings', CURRENT_USER: 'pagerrysmart_current_user',
        EXPENSES: 'pagerrysmart_expenses', PURCHASES: 'pagerrysmart_purchases',
        STOCK_ALERTS: 'pagerrysmart_stock_alerts', PROFIT_DATA: 'pagerrysmart_profit_data'
    }
};

// DOM Elements Cache
const DOM = {
    loginPage: document.getElementById('login-page'), appContainer: document.getElementById('app-container'),
    loginForm: document.getElementById('login-form'), registerForm: document.getElementById('register-form'),
    navLinks: document.querySelectorAll('.nav-link'), pageContents: document.querySelectorAll('.page-content'),
    pageTitle: document.getElementById('page-title'), currentUserEl: document.getElementById('current-user'),
    userRoleEl: document.getElementById('user-role'), logoutBtn: document.getElementById('logout-btn'),
    productsGrid: document.getElementById('products-grid'), cartItems: document.getElementById('cart-items'),
    totalEl: document.getElementById('total'), inventoryTableBody: document.getElementById('inventory-table-body'),
    salesTableBody: document.getElementById('sales-table-body'), deletedSalesTableBody: document.getElementById('deleted-sales-table-body'),
    dailySalesTableBody: document.getElementById('daily-sales-table-body'), productModal: document.getElementById('product-modal'),
    receiptModal: document.getElementById('receipt-modal'), notification: document.getElementById('notification'),
    notificationMessage: document.getElementById('notification-message'), mobileMenuBtn: document.getElementById('mobile-menu-btn'),
    sidebar: document.getElementById('sidebar')
};

// Utility Functions
const $ = (id) => document.getElementById(id);
const show = (el) => { if(el) el.style.display = 'flex'; };
const hide = (el) => { if(el) el.style.display = 'none'; };
const formatCurrency = (amount) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 2 }).format(amount);
const formatDate = (date, short = false) => {
    if (!date) return '-';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '-';
    return short ? d.toLocaleDateString() : d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
};
const generateId = () => 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
const showNotification = (message, type = 'success') => {
    if (!DOM.notification || !DOM.notificationMessage) return;
    DOM.notificationMessage.textContent = message;
    DOM.notification.className = `notification ${type} show`;
    const icon = DOM.notification.querySelector('i');
    if(icon) {
        icon.className = type === 'success' ? 'fas fa-check-circle' : 
                         type === 'error' ? 'fas fa-exclamation-circle' : 
                         type === 'warning' ? 'fas fa-exclamation-triangle' : 'fas fa-info-circle';
    }
    setTimeout(() => DOM.notification.classList.remove('show'), 3000);
};

// Auth Module
const AuthModule = {
    // ... (AuthModule code remains the same)
    async signUp(email, password, name, role = 'cashier') { /* ... */ },
    async signIn(email, password) { /* ... */ },
    async signOut() { /* ... */ },
    isAdmin: () => state.currentUser && state.currentUser.role === 'admin',
    onAuthStateChanged(callback) { /* ... */ },
    async handleExistingSession(session, callback) { /* ... */ }
};

// Data Module
const DataModule = {
    async fetchProducts() { /* ... */ },
    mergeProductData(serverProducts) { /* ... */ },
    async fetchSales() { /* ... */ },
    mergeSalesData(serverSales) { /* ... */ },
    async saveProduct(product) { /* ... */ },
    // Add other DataModule methods here as needed
};

// Local Storage Functions
function saveToLocalStorage() { /* ... */ }
function loadFromLocalStorage() { /* ... */ }

// Sync Queue Management
function addToSyncQueue(operation) { /* ... */ }
async function processSyncQueue() { /* ... */ }
async function syncSale(operation) { /* ... */ }
async function syncProduct(operation) { /* ... */ }

// Connection Management
function checkSupabaseConnection() { /* ... */ }
function updateConnectionStatus(status, message) { /* ... */ }

// Realtime Listeners
function setupRealtimeListeners() { /* ... */ }

// Stock Alert System
function checkAndGenerateAlerts() { /* ... */ }

// UI Functions
function showLogin() {
    show(DOM.loginPage);
    hide(DOM.appContainer);
}

async function showApp() {
    hide(DOM.loginPage);
    show(DOM.appContainer);
    
    if (state.currentUser) {
        DOM.currentUserEl.textContent = state.currentUser.name;
        DOM.userRoleEl.textContent = state.currentUser.role;
        
        const usersContainer = $('users-container');
        if (usersContainer) usersContainer.style.display = AuthModule.isAdmin() ? 'block' : 'none';
        
        document.querySelectorAll('.admin-only').forEach(el => {
            el.style.display = AuthModule.isAdmin() ? 'block' : 'none';
        });
    }
    
    try {
        const [productsResult, salesResult] = await Promise.allSettled([
            DataModule.fetchProducts(),
            DataModule.fetchSales()
        ]);
        
        if (productsResult.status === 'fulfilled') state.products = productsResult.value;
        if (salesResult.status === 'fulfilled') state.sales = salesResult.value;
        
        loadProducts();
        loadSales();
        setupRealtimeListeners();
    } catch (error) {
        console.error('Error loading initial data:', error);
        showNotification('Error loading data. Using offline cache.', 'warning');
        loadProducts();
        loadSales();
    }
}

function showPage(pageName) {
    DOM.pageContents.forEach(page => hide(page));
    const targetPage = $(`${pageName}-page`);
    if (targetPage) show(targetPage);
    
    DOM.navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('data-page') === pageName) link.classList.add('active');
    });
    
    const titles = {
        'pos': 'Point of Sale', 'inventory': 'Inventory Management',
        'reports': 'Sales Reports', 'expenses': 'Expense Management',
        'purchases': 'Purchase Management', 'analytics': 'Business Analytics',
        'account': 'My Account'
    };
    
    if(DOM.pageTitle) DOM.pageTitle.textContent = titles[pageName] || 'Pa Gerrys Mart';
    state.currentPage = pageName;
    
    // Load content for the specific page
    if (pageName === 'inventory') loadInventory();
    else if (pageName === 'reports') loadReports();
    else if (pageName === 'account') loadAccount();
    else if (pageName === 'expenses') loadExpenses();
    else if (pageName === 'purchases') loadPurchases();
    else if (pageName === 'analytics') loadAnalytics();
}

// Product Functions
function loadProducts() {
    if (!DOM.productsGrid) return;
    if (state.products.length === 0) {
        DOM.productsGrid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-box-open"></i>
                <h3>No Products Added Yet</h3>
                <p>Click "Add Product" to start adding your inventory</p>
            </div>
        `;
        return;
    }
    
    DOM.productsGrid.innerHTML = '';
    state.products.forEach(product => {
        if (product.deleted) return;
        
        const today = new Date();
        const expiryDate = new Date(product.expiryDate);
        const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
        
        let expiryWarning = '';
        let productNameStyle = '';
        
        if (daysUntilExpiry < 0) {
            expiryWarning = `<div class="expiry-warning"><i class="fas fa-exclamation-triangle"></i> Expired</div>`;
            productNameStyle = 'style="color: red; font-weight: bold;"';
        } else if (daysUntilExpiry <= state.settings.expiryWarningDays) {
            expiryWarning = `<div class="expiry-warning"><i class="fas fa-clock"></i> Expires in ${daysUntilExpiry} days</div>`;
            productNameStyle = 'style="color: orange; font-weight: bold;"';
        }
        
        let stockClass = 'stock-high';
        if (product.stock <= 0) {
            stockClass = 'stock-low';
        } else if (product.stock <= state.settings.lowStockThreshold) {
            stockClass = 'stock-medium';
        }
        
        const productCard = document.createElement('div');
        productCard.className = 'product-card';
        productCard.innerHTML = `
            <div class="product-img"><i class="fas fa-box"></i></div>
            <h4 ${productNameStyle}>${product.name}</h4>
            <div class="price">${formatCurrency(product.price)}</div>
            <div class="stock ${stockClass}">Stock: ${product.stock}</div>
            ${expiryWarning}
        `;
        
        productCard.addEventListener('click', () => addToCart(product));
        DOM.productsGrid.appendChild(productCard);
    });
}

// Cart Functions
function addToCart(product) {
    if (product.stock <= 0) {
        showNotification('Product is out of stock', 'error');
        return;
    }
    
    const existingItem = state.cart.find(item => item.id === product.id);
    
    if (existingItem) {
        if (existingItem.quantity >= product.stock) {
            showNotification('Not enough stock available', 'error');
            return;
        }
        existingItem.quantity++;
    } else {
        state.cart.push({
            id: product.id, name: product.name,
            price: product.price, quantity: 1
        });
    }
    
    updateCart();
}

function updateCart() {
    if (!DOM.cartItems || !DOM.totalEl) return;
    if (state.cart.length === 0) {
        DOM.cartItems.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">No items in cart</p>';
        DOM.totalEl.textContent = formatCurrency(0);
        return;
    }
    
    DOM.cartItems.innerHTML = '';
    let total = 0;
    
    state.cart.forEach(item => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;
        
        const cartItem = document.createElement('div');
        cartItem.className = 'cart-item';
        cartItem.innerHTML = `
            <div class="cart-item-info">
                <div class="cart-item-name">${item.name}</div>
                <div class="cart-item-price">${formatCurrency(item.price)}</div>
                <div class="cart-item-qty">
                    <button onclick="updateQuantity('${item.id}', -1)">-</button>
                    <input type="number" value="${item.quantity}" min="1" readonly>
                    <button onclick="updateQuantity('${item.id}', 1)">+</button>
                </div>
            </div>
            <div class="cart-item-total">${formatCurrency(itemTotal)}</div>
        `;
        
        DOM.cartItems.appendChild(cartItem);
    });
    
    DOM.totalEl.textContent = formatCurrency(total);
}

// IMPLEMENTED: Function to update item quantity in the cart
function updateQuantity(id, change) {
    const item = state.cart.find(item => item.id === id);
    if (!item) return;

    const product = state.products.find(p => p.id === id);
    if (!product) return;

    const newQuantity = item.quantity + change;

    if (newQuantity <= 0) {
        state.cart = state.cart.filter(cartItem => cartItem.id !== id);
    } else if (newQuantity > product.stock) {
        showNotification('Cannot exceed available stock', 'warning');
        return;
    } else {
        item.quantity = newQuantity;
    }

    updateCart();
}

// IMPLEMENTED: Function to complete a sale
async function completeSale() {
    if (state.cart.length === 0) {
        showNotification('Your cart is empty', 'warning');
        return;
    }

    const sale = {
        receiptNumber: 'RCP' + Date.now(),
        items: [...state.cart],
        total: state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0),
        created_at: new Date().toISOString(),
        cashier: state.currentUser ? state.currentUser.name : 'Unknown Cashier',
        cashierId: state.currentUser ? state.currentUser.id : null
    };

    // Update product stock
    sale.items.forEach(saleItem => {
        const product = state.products.find(p => p.id === saleItem.id);
        if (product) {
            product.stock -= saleItem.quantity;
        }
    });

    // Add sale to state and save
    state.sales.unshift(sale);
    state.cart = [];
    saveToLocalStorage();

    // Sync with server if online
    if (state.isOnline) {
        addToSyncQueue({ type: 'saveSale', data: sale });
    }

    // Update UI
    updateCart();
    loadProducts(); // Refresh product grid to show new stock levels
    if (state.currentPage === 'reports') {
        loadSales(); // Refresh sales report if on that page
    }

    showNotification('Sale completed successfully!', 'success');
    // TODO: Add logic to show a receipt modal here
}

// Sales Functions
function loadSales() {
    if (!DOM.salesTableBody) return;

    if (state.sales.length === 0) {
        DOM.salesTableBody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 20px; color: #999;">
                    No sales recorded yet
                </td>
            </tr>
        `;
        return;
    }
    
    DOM.salesTableBody.innerHTML = '';
    
    state.sales.forEach(sale => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${sale.receiptNumber || 'N/A'}</td>
            <td>${formatDate(sale.created_at)}</td>
            <td>${sale.cashier || 'Unknown'}</td>
            <td>${sale.items ? sale.items.length : 0}</td>
            <td>${formatCurrency(sale.total || 0)}</td>
            <td>
                <button class="btn-small" onclick="viewSaleDetails('${sale.receiptNumber}')">
                    <i class="fas fa-eye"></i> View
                </button>
            </td>
        `;
        DOM.salesTableBody.appendChild(row);
    });
}

function viewSaleDetails(receiptNumber) {
    const sale = state.sales.find(s => s.receiptNumber === receiptNumber);
    if (!sale) {
        showNotification('Sale details not found', 'error');
        return;
    }
    
    console.log('Viewing sale details:', sale);
    showNotification(`Viewing details for Receipt #${receiptNumber}`, 'info');
    // TODO: Implement a modal to display sale.items and other details
}

// IMPLEMENTED: Basic placeholders for page loading functions to prevent errors
function loadInventory() {
    const container = $('inventory-page');
    if (container) {
        container.innerHTML = `<h2>Inventory Management</h2><p>Inventory page content is under construction.</p>`;
    }
}

function loadReports() {
    const container = $('reports-page');
    if (container) {
        container.innerHTML = `<h2>Sales Reports</h2><p>Reports page content is under construction.</p>`;
    }
    loadSales(); // Still try to load the sales table if it exists inside
}

function loadAccount() {
    const container = $('account-page');
    if (container) {
        container.innerHTML = `<h2>My Account</h2><p>Account page content is under construction.</p>`;
    }
}

function loadExpenses() {
    const container = $('expenses-page');
    if (container) {
        container.innerHTML = `<h2>Expense Management</h2><p>Expenses page content is under construction.</p>`;
    }
}

function loadPurchases() {
    const container = $('purchases-page');
    if (container) {
        container.innerHTML = `<h2>Purchase Management</h2><p>Purchases page content is under construction.</p>`;
    }
}

function loadAnalytics() {
    const container = $('analytics-page');
    if (container) {
        container.innerHTML = `<h2>Business Analytics</h2><p>Analytics page content is under construction.</p>`;
    }
}

function refreshAllData() {
    console.log("Refreshing all data...");
    // This function would re-fetch data from the server
    showNotification("Data refresh initiated.", "info");
}

// Event Listeners
if(DOM.loginForm) {
    DOM.loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = $('login-email').value;
        const password = $('login-password').value;
        AuthModule.signIn(email, password);
    });
}

if(DOM.logoutBtn) {
    DOM.logoutBtn.addEventListener('click', AuthModule.signOut);
}

// Initialize app
async function init() {
    loadFromLocalStorage();
    
    AuthModule.onAuthStateChanged(async (user) => {
        if (user) {
            if (!state.currentUser || state.currentUser.id !== user.id) {
                state.currentUser = user; // Simplified for this example
            }
            showApp();
        } else {
            showLogin();
        }
    });

    showPage('pos');
    
    if (state.isOnline) {
        checkSupabaseConnection();
    }
}

// Start app when DOM is ready
document.addEventListener('DOMContentLoaded', init);