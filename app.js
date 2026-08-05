// ═══════════════════════════════════════════════════════
//  MODULE 01: Firebase Init & Utilities
// GoChat Fresh Rebuild 2026
// ═══════════════════════════════════════════════════════

// ===== FIREBASE CONFIGURATION =====
const firebaseConfig = {
  apiKey: "AIzaSyAnKueAHG8cw6O-Hy8U9fgGzH4fDMYQBy8",
  authDomain: "gochat-3efa3.firebaseapp.com",
  projectId: "gochat-3efa3",
  storageBucket: "gochat-3efa3.firebasestorage.app",
  messagingSenderId: "203332487017",
  appId: "1:203332487017:web:06af0b8b4b12af89581ff8"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Enable long polling for better connectivity
db.settings({ experimentalForceLongPolling: true });

// ===== GLOBAL STATE VARIABLES =====
let currentUser = null;
let currentUserData = null;
let currentChatId = null;
let currentChatOtherUid = null;
let currentOtherProfileUid = null;

// Firestore Unsubscribers
let feedUnsub = null;
let chatUnsub = null;
let notifUnsub = null;
let storyUnsub = null;
let onlineUnsub = null;
let commentPanelListener = null;

// UI State
let composeImages = [];
let currentPostBgColor = 'default';
let currentPostActivity = null;
let currentTaggedFriends = [];
let currentTaggedNames = [];
let currentReplyMsgId = null;
let replyToMsgData = null;
let currentForwardMsgData = null;
let activeCommentPostId = null;

// Cache
let allUsersCache = null;
let usersCacheLoaded = false;
let usersCacheTimestamp = 0;

// Timers & Limits
let typingTimeout = null;
let searchTimeout = null;
let onlineStatusInterval = null;
let lastActionTime = 0;
const RATE_LIMIT_MS = 1000;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_IMAGES_PER_POST = 5;
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// App State
let postLimit = 10;
let currentFeedTab = 'foryou';
let isAppReadyForNotifs = false;
let isFriendsEditMode = false;
let friendsToDelete = [];

// ===== UTILITY FUNCTIONS =====

// Escape HTML to prevent XSS
function escapeHTML(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Get relative time (e.g., "2h ago", "3d ago")
function getRelativeTime(ts) {
  if (!ts) return 'Just now';
  const ms = ts.toMillis ? ts.toMillis() : (ts.seconds ? ts.seconds * 1000 : ts);
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  if (m < 1) return 'Just now';
  if (m < 60) return m + 'm ago';
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

// Get avatar initial letter
function avatarInitial(name) {
  return name ? name[0].toUpperCase() : '?';
}

// Get verified badge HTML
function getVerifiedBadge(email, isVerified) {
  if (isVerified === true) {
    return '<span class="verified-icon" style="color: var(--accent); font-size: 18px; margin-left: 4px;">✓</span>';
  }
  return '';
}

// Show toast notification
function showToast(message, duration = 3000) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    bottom: 100px;
    left: 50%;
    transform: translateX(-50%) translateY(20px);
    background: var(--surface);
    color: var(--text);
    padding: 12px 24px;
    border-radius: var(--radius-full);
    font-size: 14px;
    font-weight: 600;
    z-index: 999999;
    opacity: 0;
    transition: all 0.3s;
    pointer-events: none;
    box-shadow: var(--shadow-lg);
    border: 1px solid var(--border);
    white-space: nowrap;
    max-width: 90%;
    overflow: hidden;
    text-overflow: ellipsis;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  }, 10);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Rate limiting
function checkRateLimit() {
  const now = Date.now();
  if (now - lastActionTime < RATE_LIMIT_MS) {
    showToast('Please wait a moment');
    return false;
  }
  lastActionTime = now;
  return true;
}

// Award points to user
async function awardPoints(uid, amount) {
  if (!uid || !amount) return;
  try {
    await db.collection('users').doc(uid).update({
      points: firebase.firestore.FieldValue.increment(amount)
    });
  } catch (e) {
    console.log("Error awarding points", e);
  }
}

// Format large numbers (1.2K, 3.5M)
function formatNumber(n) {
  n = n || 0;
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

// Toggle dark mode
function toggleDarkMode() {
  document.body.classList.toggle('light-mode');
  const isLight = document.body.classList.contains('light-mode');
  localStorage.setItem('gochat-theme', isLight ? 'light' : 'dark');
  showToast(isLight ? 'Light mode enabled' : 'Dark mode enabled');
}

// Load theme preference
function loadTheme() {
  const saved = localStorage.getItem('gochat-theme');
  if (saved === 'light') {
    document.body.classList.add('light-mode');
  }
}

// ===== AUTH STATE LISTENER =====
auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    await loadUserData();
    showApp();
    initApp();
  } else {
    currentUser = null;
    currentUserData = null;
    showAuth();
  }
});

// Load user data from Firestore
async function loadUserData() {
  if (!currentUser) return;
  try {
    const doc = await db.collection('users').doc(currentUser.uid).get();
    if (doc.exists) {
      currentUserData = doc.data();
      // Update online status
      await db.collection('users').doc(currentUser.uid).update({
        lastOnline: firebase.firestore.FieldValue.serverTimestamp(),
        isOnline: true
      });
    } else {
      // Create new user document
      const userData = {
        uid: currentUser.uid,
        email: currentUser.email,
        name: currentUser.displayName || currentUser.email.split('@')[0],
        avatar: currentUser.photoURL || '',
        bio: '',
        gender: '',
        relationship: '',
        profession: '',
        livesIn: '',
        from: '',
        username: '',
        followers: [],
        following: [],
        blockedUsers: [],
        savedPosts: [],
        points: 0,
        isVerified: false,
        isOnline: true,
        lastOnline: firebase.firestore.FieldValue.serverTimestamp(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      await db.collection('users').doc(currentUser.uid).set(userData);
      currentUserData = userData;
    }
  } catch (e) {
    console.error('Error loading user data:', e);
    showToast('Failed to load profile');
  }
}

// Show app container
function showApp() {
  document.getElementById('splash-screen').classList.add('hide');
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-container').style.display = 'flex';
  updateNavProfile();
}

// Show auth screen
function showAuth() {
  document.getElementById('splash-screen').classList.add('hide');
  document.getElementById('app-container').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'flex';
}

// Update navigation profile avatar
function updateNavProfile() {
  const navAvatar = document.getElementById('nav-profile-avatar');
  if (navAvatar && currentUserData) {
    if (currentUserData.avatar) {
      navAvatar.innerHTML = `<img src="${escapeHTML(currentUserData.avatar)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
    } else {
      navAvatar.innerHTML = avatarInitial(currentUserData.name || 'U');
    }
  }
}

// Initialize app after login
function initApp() {
  loadTheme();
  loadFeed();
  loadStories();
  loadNotifications();
  loadChatList();
  loadAllUsersCache();
  isAppReadyForNotifs = true;
}

// Load all users cache (for mentions, search, etc.)
async function loadAllUsersCache() {
  if (usersCacheLoaded && (Date.now() - usersCacheTimestamp < 60000)) return;
  try {
    const snap = await db.collection('users').get();
    allUsersCache = [];
    snap.forEach(doc => {
      allUsersCache.push({ id: doc.id, ...doc.data() });
    });
    usersCacheLoaded = true;
    usersCacheTimestamp = Date.now();
  } catch (e) {
    console.error('Error loading users cache:', e);
  }
}

// ===== PAGE NAVIGATION =====
function showPage(pageId) {
  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  
  // Show target page
  const target = document.getElementById('page-' + pageId);
  if (target) {
    target.classList.add('active');
  }
  
  // Update nav
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const navItems = document.querySelectorAll('.nav-item');
  const pageMap = { 'feed': 0, 'friends': 1, 'messages': 3, 'profile': 4 };
  if (pageMap[pageId] !== undefined && navItems[pageMap[pageId]]) {
    navItems[pageMap[pageId]].classList.add('active');
  }
  
  // Page-specific actions
  if (pageId === 'feed') {
    loadFeed();
  } else if (pageId === 'messages') {
    loadChatList();
  } else if (pageId === 'notifications') {
    loadNotifications();
  } else if (pageId === 'profile') {
    loadMyProfile();
  }
}

// ===== LOGOUT =====
async function handleLogout() {
  if (!confirm('Are you sure you want to log out?')) return;
  try {
    await db.collection('users').doc(currentUser.uid).update({
      isOnline: false,
      lastOnline: firebase.firestore.FieldValue.serverTimestamp()
    });
    await auth.signOut();
    showToast('Logged out successfully');
  } catch (e) {
    console.error('Logout error:', e);
    showToast('Failed to logout');
  }
}

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
  loadTheme();
  
  // Splash screen timeout
  setTimeout(() => {
    document.getElementById('splash-screen').classList.add('hide');
  }, 2000);
});

console.log('✅ Module 01: Firebase Init & Utilities loaded');
// ═══════════════════════════════════════════════════════
//  MODULE 02: Authentication
// GoChat Fresh Rebuild 2026
// ══════════════════════════════════════════════════════

// ===== LOGIN WITH EMAIL =====
async function loginWithEmail() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  
  if (!email || !password) {
    showToast('Please enter email and password');
    return;
  }
  
  if (!checkRateLimit()) return;
  
  try {
    showToast('Logging in...');
    await auth.signInWithEmailAndPassword(email, password);
    // Auth state listener will handle the rest
  } catch (e) {
    console.error('Login error:', e);
    let message = 'Login failed';
    if (e.code === 'auth/user-not-found') message = 'User not found';
    else if (e.code === 'auth/wrong-password') message = 'Wrong password';
    else if (e.code === 'auth/invalid-email') message = 'Invalid email';
    else if (e.code === 'auth/too-many-requests') message = 'Too many attempts. Try later';
    showToast(message);
  }
}

// ===== REGISTRATION WITH EMAIL =====
async function registerWithEmail() {
  const fname = document.getElementById('reg-fname').value.trim();
  const lname = document.getElementById('reg-lname').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-pass').value;
  const confirm = document.getElementById('reg-confirm').value;
  
  if (!fname || !email || !password) {
    showToast('Please fill all required fields');
    return;
  }
  
  if (password.length < 6) {
    showToast('Password must be at least 6 characters');
    return;
  }
  
  if (password !== confirm) {
    showToast('Passwords do not match');
    return;
  }
  
  if (!checkRateLimit()) return;
  
  try {
    showToast('Creating account...');
    const credential = await auth.createUserWithEmailAndPassword(email, password);
    const user = credential.user;
    
    // Update display name
    await user.updateProfile({
      displayName: fname + (lname ? ' ' + lname : '')
    });
    
    // Create user document
    const userData = {
      uid: user.uid,
      email: email,
      name: fname + (lname ? ' ' + lname : ''),
      firstName: fname,
      lastName: lname || '',
      avatar: '',
      bio: '',
      gender: '',
      relationship: '',
      profession: '',
      livesIn: '',
      from: '',
      username: '',
      followers: [],
      following: [],
      blockedUsers: [],
      savedPosts: [],
      points: 100, // Welcome bonus
      isVerified: false,
      isOnline: true,
      lastOnline: firebase.firestore.FieldValue.serverTimestamp(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    await db.collection('users').doc(user.uid).set(userData);
    
    showToast('Account created successfully! 🎉');
  } catch (e) {
    console.error('Registration error:', e);
    let message = 'Registration failed';
    if (e.code === 'auth/email-already-in-use') message = 'Email already registered';
    else if (e.code === 'auth/invalid-email') message = 'Invalid email';
    else if (e.code === 'auth/weak-password') message = 'Password too weak';
    showToast(message);
  }
}

// ===== GOOGLE SIGN-IN =====
async function loginWithGoogle() {
  if (!checkRateLimit()) return;
  
  try {
    showToast('Signing in with Google...');
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope('profile');
    provider.addScope('email');
    
    const result = await auth.signInWithPopup(provider);
    const user = result.user;
    
    // Check if user exists
    const doc = await db.collection('users').doc(user.uid).get();
    
    if (!doc.exists) {
      // Create new user document
      const userData = {
        uid: user.uid,
        email: user.email,
        name: user.displayName || user.email.split('@')[0],
        avatar: user.photoURL || '',
        bio: '',
        gender: '',
        relationship: '',
        profession: '',
        livesIn: '',
        from: '',
        username: '',
        followers: [],
        following: [],
        blockedUsers: [],
        savedPosts: [],
        points: 100,
        isVerified: false,
        isOnline: true,
        lastOnline: firebase.firestore.FieldValue.serverTimestamp(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      await db.collection('users').doc(user.uid).set(userData);
    } else {
      // Update online status
      await db.collection('users').doc(user.uid).update({
        isOnline: true,
        lastOnline: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    
    showToast('Welcome to GoChat! 🎉');
  } catch (e) {
    console.error('Google sign-in error:', e);
    if (e.code !== 'auth/popup-closed-by-user') {
      showToast('Google sign-in failed');
    }
  }
}

// ===== PASSWORD VISIBILITY TOGGLE =====
function togglePasswordVisibility() {
  const passwordInput = document.getElementById('auth-password');
  const eyeIcon = document.getElementById('toggle-eye');
  
  if (passwordInput.type === 'password') {
    passwordInput.type = 'text';
    eyeIcon.textContent = 'visibility_off';
  } else {
    passwordInput.type = 'password';
    eyeIcon.textContent = 'visibility';
  }
}

// ===== REGISTRATION STEPS =====
function showRegister() {
  document.getElementById('login-form').style.display = 'none';
  document.getElementById('registration-steps').style.display = 'block';
  document.getElementById('step-1').style.display = 'block';
  document.getElementById('step-2').style.display = 'none';
}

function goToLogin() {
  document.getElementById('registration-steps').style.display = 'none';
  document.getElementById('login-form').style.display = 'block';
}

function nextRegStep(step) {
  if (step === 2) {
    const fname = document.getElementById('reg-fname').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    
    if (!fname || !email) {
      showToast('Please fill all fields');
      return;
    }
    
    document.getElementById('step-1').style.display = 'none';
    document.getElementById('step-2').style.display = 'block';
  } else if (step === 1) {
    document.getElementById('step-2').style.display = 'none';
    document.getElementById('step-1').style.display = 'block';
  }
}

// ===== LOGIN SUCCESS MODAL =====
function showLoginSuccessModal() {
  const modal = document.getElementById('login-success-modal');
  if (modal) {
    modal.style.display = 'flex';
    setTimeout(() => {
      modal.style.display = 'none';
    }, 3000);
  }
}

// ===== EMAIL VERIFICATION =====
async function sendEmailVerification() {
  if (!currentUser) return;
  
  try {
    await currentUser.sendEmailVerification();
    showToast('Verification email sent! Check your inbox');
  } catch (e) {
    console.error('Verification error:', e);
    showToast('Failed to send verification email');
  }
}

// ===== PASSWORD RESET =====
async function resetPassword() {
  const email = document.getElementById('auth-email').value.trim();
  
  if (!email) {
    showToast('Please enter your email first');
    return;
  }
  
  if (!checkRateLimit()) return;
  
  try {
    await auth.sendPasswordResetEmail(email);
    showToast('Password reset email sent!');
  } catch (e) {
    console.error('Password reset error:', e);
    showToast('Failed to send reset email');
  }
}

// ===== AUTH SCREEN ANIMATIONS =====
document.addEventListener('DOMContentLoaded', () => {
  // Add staggered animation to auth inputs
  const authInputs = document.querySelectorAll('.auth-input-group');
  authInputs.forEach((input, index) => {
    input.style.opacity = '0';
    input.style.transform = 'translateY(20px)';
    setTimeout(() => {
      input.style.transition = 'all 0.5s ease';
      input.style.opacity = '1';
      input.style.transform = 'translateY(0)';
    }, 300 + (index * 100));
  });
  
  // Enter key support
  const authEmail = document.getElementById('auth-email');
  const authPassword = document.getElementById('auth-password');
  
  if (authEmail) {
    authEmail.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') authPassword.focus();
    });
  }
  
  if (authPassword) {
    authPassword.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') loginWithEmail();
    });
  }
});

console.log('✅ Module 02: Authentication loaded');
// ══════════════════════════════════════════════════════
//  MODULE 03: Feed System
// GoChat Fresh Rebuild 2026
// ═══════════════════════════════════════════════════════

// ===== LOAD FEED =====
async function loadFeed() {
  const feedList = document.getElementById('feed-list');
  const loadingSkeleton = document.getElementById('feed-loading');
  
  if (!feedList) return;
  
  // Show skeleton loading
  if (loadingSkeleton) loadingSkeleton.style.display = 'block';
  feedList.innerHTML = '';
  
  try {
    let query;
    
    if (currentFeedTab === 'following') {
      // Load posts from followed users
      const following = currentUserData?.following || [];
      if (following.length === 0) {
        feedList.innerHTML = '<div class="empty-feed"><span class="material-symbols-outlined">person_off</span>Follow people to see their posts</div>';
        return;
      }
      query = db.collection('posts')
        .where('uid', 'in', following.slice(0, 10)) // Firestore 'in' query limit: 10
        .orderBy('createdAt', 'desc')
        .limit(postLimit);
    } else {
      // Load all posts (For You)
      query = db.collection('posts')
        .orderBy('createdAt', 'desc')
        .limit(postLimit);
    }
    
    const snapshot = await query.get();
    
    if (snapshot.empty) {
      feedList.innerHTML = '<div class="empty-feed"><span class="material-symbols-outlined">inbox</span>No posts yet</div>';
      return;
    }
    
    let html = '';
    snapshot.forEach(doc => {
      const post = doc.data();
      post.id = doc.id;
      html += buildPostCardHTML(post);
    });
    
    feedList.innerHTML = html;
    
    // Hide skeleton
    if (loadingSkeleton) loadingSkeleton.style.display = 'none';
    
  } catch (e) {
    console.error('Feed load error:', e);
    feedList.innerHTML = '<div class="empty-feed"><span class="material-symbols-outlined">error</span>Failed to load feed</div>';
    if (loadingSkeleton) loadingSkeleton.style.display = 'none';
  }
}

// ===== BUILD POST CARD HTML =====
function buildPostCardHTML(p) {
  const pid = p.id;
  const uniqueDropId = pid + '_' + Math.random().toString(36).substr(2, 5);
  const av = p.avatar ? `<img src="${escapeHTML(p.avatar)}">` : avatarInitial(p.name || '?');
  const vBadge = getVerifiedBadge(p.email, p.isVerified);
  const isLiked = p.likedBy && p.likedBy.includes(currentUser?.uid);
  const isReposted = p.repostedBy && p.repostedBy.includes(currentUser?.uid);
  const repostCount = p.repostCount || 0;
  const commentCount = p.comments ? p.comments.length : 0;
  const safeName = escapeHTML(p.name || 'User');
  const safeTitle = escapeHTML(p.title || '');
  const safeTitleForAttr = (p.title || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
  
  // Tagged friends display
  let withText = '';
  if (p.taggedNames && p.taggedNames.length > 0 && p.tagged) {
    if (p.taggedNames.length === 1) {
      withText = `<span style="font-weight:500; color:var(--text-secondary); font-size:14px; margin-left:4px;">is with</span> <strong style="color:var(--text); font-size:14px; margin-left:4px; cursor:pointer;" onclick="event.stopPropagation(); viewUserProfile('${p.tagged[0]}')">${escapeHTML(p.taggedNames[0])}</strong>`;
    } else if (p.taggedNames.length === 2) {
      withText = `<span style="font-weight:500; color:var(--text-secondary); font-size:14px; margin-left:4px;">is with</span> <strong style="color:var(--text); font-size:14px; margin-left:4px; cursor:pointer;" onclick="event.stopPropagation(); viewUserProfile('${p.tagged[0]}')">${escapeHTML(p.taggedNames[0])}</strong> <span style="font-weight:500; color:var(--text-secondary); font-size:14px; margin-left:4px;">and</span> <strong style="color:var(--text); font-size:14px; margin-left:4px; cursor:pointer;" onclick="event.stopPropagation(); viewUserProfile('${p.tagged[1]}')">${escapeHTML(p.taggedNames[1])}</strong>`;
    } else if (p.taggedNames.length > 2) {
      withText = `<span style="font-weight:500; color:var(--text-secondary); font-size:14px; margin-left:4px;">is with</span> <strong style="color:var(--text); font-size:14px; margin-left:4px; cursor:pointer;" onclick="event.stopPropagation(); viewUserProfile('${p.tagged[0]}')">${escapeHTML(p.taggedNames[0])}</strong> <span style="font-weight:500; color:var(--text-secondary); font-size:14px; margin-left:4px;">and</span> <strong style="color:var(--text); font-size:14px; margin-left:4px;">${p.taggedNames.length - 1} others</strong>`;
    }
  }
  
  // Activity/Feeling
  let activityHtml = '';
  if (p.activity) {
    activityHtml = `<span style="font-weight:500; color:var(--text-secondary); font-size:14px; margin-left:4px;">is ${escapeHTML(p.activity.text)}</span> <span class="material-symbols-outlined" style="font-size:16px; margin-left:4px; vertical-align:middle; color:var(--accent);">${escapeHTML(p.activity.icon)}</span>`;
  }
  
  // Media (images)
  const imgUrls = p.imgUrls && p.imgUrls.length > 0 ? p.imgUrls : (p.imgUrl ? [p.imgUrl] : []);
  let mediaHtml = '';
  if (imgUrls.length > 1) {
    let slides = imgUrls.map(url => {
      const safeUrl = escapeHTML(url);
      return `<div style="min-width:100%;"><img class="post-img" src="${safeUrl}" onclick="event.stopPropagation();openImageZoom('${safeUrl}')" style="margin-bottom:0;"></div>`;
    }).join('');
    mediaHtml = `<div class="post-media-wrap" ondblclick="event.stopPropagation(); handleDoubleTap('${pid}',event)">
      <div style="display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;">
        ${slides}
      </div>
      <i class="ph-fill ph-heart double-tap-heart"></i>
    </div>`;
  } else if (imgUrls.length === 1) {
    const safeUrl = escapeHTML(imgUrls[0]);
    mediaHtml = `<div class="post-media-wrap" ondblclick="event.stopPropagation(); handleDoubleTap('${pid}',event)">
      <img class="post-img" src="${safeUrl}" onclick="event.stopPropagation();openImageZoom('${safeUrl}')">
      <span class="material-symbols-outlined double-tap-heart filled" style="font-variation-settings:'FILL' 1;">favorite</span>
    </div>`;
  }
  
  // Post dropdown menu
  let postDropdownHtml = `<div style="position:relative;margin-left:auto;">
    <i class="ph-bold ph-dots-three-vertical more-btn" onclick="event.stopPropagation();togglePostDropdown('post-drop-${uniqueDropId}')" style="cursor:pointer;padding:6px;border-radius:50%;color:var(--text-secondary);font-size:24px;"></i>
    <div id="post-drop-${uniqueDropId}" class="post-dropdown-menu" onclick="event.stopPropagation();">`;
  
  if (p.uid === currentUser?.uid) {
    const pinText = p.isPinned ? 'Unpin Post' : 'Pin Post';
    postDropdownHtml += `<div class="chat-dropdown-item" onclick="event.stopPropagation(); openPostInsights('${pid}')"><span class="material-symbols-outlined">insights</span> Post Insights</div>`;
    const pinIcon = p.isPinned ? 'ph-push-pin-slash' : 'ph-push-pin';
    postDropdownHtml += `
      <div class="chat-dropdown-item" onclick="event.stopPropagation(); pinPost('${pid}')">
        <i class="ph-bold ${pinIcon}" style="font-size:20px;"></i> ${pinText}
      </div>
      <div class="chat-dropdown-item" onclick="event.stopPropagation(); openEditPostModal('${pid}','${safeTitleForAttr}')">
        <i class="ph-bold ph-pencil-simple" style="font-size:20px;"></i> Edit Post
      </div>
      <div class="chat-dropdown-item danger" onclick="event.stopPropagation(); deletePost('${pid}')">
        <i class="ph-bold ph-trash" style="font-size:20px;"></i> Delete Post
      </div>`;
  } else {
    const isAlreadySaved = currentUserData?.savedPosts?.includes(pid);
    if (isAlreadySaved) {
      postDropdownHtml += `
        <div class="chat-dropdown-item" onclick="event.stopPropagation(); unsavePost('${pid}')">
          <i class="ph-bold ph-bookmark-simple-minus" style="color: var(--danger); font-size:20px;"></i> Remove from Saved
        </div>`;
    } else {
      postDropdownHtml += `
        <div class="chat-dropdown-item" onclick="event.stopPropagation(); markInterested('${pid}')">
          <i class="ph-bold ph-star" style="color: #f59e0b; font-size:20px;"></i> Interested (Save)
        </div>`;
    }
    postDropdownHtml += `
      <div class="chat-dropdown-item" onclick="event.stopPropagation(); markNotInterested('${pid}', this)">
        <i class="ph-bold ph-eye-slash" style="font-size:20px;"></i> Not Interested
      </div>`;
  }
  postDropdownHtml += `</div></div>`;
  
  // Quick follow button
  const isMePost = (p.uid === currentUser?.uid);
  const isAlreadyFollowing = currentUserData?.following?.includes(p.uid);
  let quickFollowBtn = '';
  if (!isMePost && !isAlreadyFollowing) {
    quickFollowBtn = `<span onclick="event.stopPropagation(); toggleFollow('${p.uid}'); this.style.display='none';" style="color: var(--accent); font-size: 12px; font-weight: 700; cursor: pointer; margin-left: 8px; padding: 2px 10px; background: var(--surface-2); border-radius: 12px; border: 1px solid var(--accent); transition: all 0.2s;">Follow</span>`;
  }
  
  // Premium post class for verified users
  const premiumPostClass = p.isVerified ? 'verified-premium-post' : '';
  
  return `<div class="post-card ${premiumPostClass}" style="cursor:pointer;" onclick="openSinglePostView('${pid}')">
    <div class="post-header">
      <div class="avatar" style="width:44px;height:44px;cursor:pointer;" onclick="event.stopPropagation(); viewUserProfile('${p.uid}')">${av}</div>
      <div style="flex:1;" onclick="event.stopPropagation(); viewUserProfile('${p.uid}')">
        <div class="post-name" style="display: block; line-height: 1.4; cursor:pointer;">
          <span style="display: inline;">${safeName} <span style="display: inline-flex; vertical-align: middle; margin-top: -3px; margin-left: 2px;">${vBadge}</span></span>
          ${quickFollowBtn}
          ${activityHtml}
          ${withText}
        </div>
        <div class="post-time">${getRelativeTime(p.createdAt)}</div>
      </div>
      ${postDropdownHtml}
    </div>
    ${p.title ? (() => {
      let processedTitle = escapeHTML(p.title || '');
      if (typeof allUsersCache !== 'undefined' && allUsersCache) {
        [...allUsersCache].sort((a,b)=>(b.name||'').length-(a.name||'').length).forEach(u=>{
          if(u.name){
            const regex = new RegExp(`@${u.name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}`, 'gi');
            processedTitle = processedTitle.replace(regex, `<strong style="color:var(--accent); cursor:pointer;" onclick="event.stopPropagation(); viewUserProfile('${u.id}')">@${u.name}</strong>`);
          }
        });
      }
      const hasImages = (p.imgUrls && p.imgUrls.length > 0) || p.imgUrl;
      if (p.bgColor && p.bgColor !== 'default' && !hasImages) {
        return `<div class="colored-post-bg" style="background: ${escapeHTML(p.bgColor)};">${processedTitle}</div>`;
      } else {
        return `<div style="font-weight:600;font-size:16px;margin-bottom:12px;color:var(--text);white-space:pre-wrap;line-height:1.5;">${processedTitle}</div>`;
      }
    })() : ''}
    ${mediaHtml}
    <div class="post-actions">
      <button class="post-action-btn ${isLiked ? 'liked' : ''}" onclick="event.stopPropagation(); toggleLike('${pid}')">
        <i class="${isLiked ? 'ph-fill' : 'ph-bold'} ph-heart" style="font-size:24px;"></i>
        <span style="font-size:14px;">${p.likes || 0}</span>
      </button>
      <button class="post-action-btn" onclick="event.stopPropagation(); openCommentPanel('${pid}')">
        <i class="ph-bold ph-chat-circle" style="font-size:24px;"></i>
        <span style="font-size:14px;">${commentCount}</span>
      </button>
      <button class="post-action-btn ${isReposted ? 'reposted' : ''}" onclick="event.stopPropagation(); openRepostOptions('${pid}')">
        <i class="material-symbols-outlined" style="font-size:24px;">${isReposted ? 'repeat_on' : 'repeat'}</i>
        <span style="font-size:14px;">${repostCount}</span>
      </button>
      <button class="post-action-btn" onclick="event.stopPropagation(); openShareModal('${pid}', '${safeTitleForAttr}', '${imgUrls[0] || ''}')">
        <i class="ph-bold ph-share-network" style="font-size:24px;"></i>
        <span style="font-size:14px;">${p.shares || 0}</span>
      </button>
    </div>
  </div>`;
}

// ===== SET FEED TAB =====
function setFeedTab(tab) {
  currentFeedTab = tab;
  
  // Update UI
  document.querySelectorAll('.feed-tab').forEach(t => t.classList.remove('active'));
  const activeTab = document.getElementById('tab-' + tab);
  if (activeTab) activeTab.classList.add('active');
  
  // Reload feed
  postLimit = 10;
  loadFeed();
}

// ===== REFRESH FEED =====
function refreshFeed() {
  postLimit = 10;
  loadFeed();
  showToast('Feed refreshed');
}

// ===== LOAD MORE POSTS (Infinite Scroll) =====
async function loadMorePosts() {
  postLimit += 10;
  await loadFeed();
}

console.log('✅ Module 03: Feed System loaded');
// ══════════════════════════════════════════════════════
//  MODULE 04: Posts System
// GoChat Fresh Rebuild 2026
// ═══════════════════════════════════════════════════════

// ===== CHECK POST INPUTS =====
function checkPostInputs() {
  const title = document.getElementById('post-title')?.value.trim() || '';
  const btn = document.getElementById('modal-post-btn');
  
  if (btn) {
    if (title || composeImages.length > 0) {
      btn.disabled = false;
    } else {
      btn.disabled = true;
    }
  }
}

// ===== SUBMIT POST =====
async function submitPost() {
  const title = document.getElementById('post-title').value.trim();
  if (!title && composeImages.length === 0) return;
  if (!checkRateLimit()) return;
  
  let imgUrls = [];
  if (composeImages.length > 0) {
    showToast('Uploading images...');
    try {
      for (let i = 0; i < composeImages.length; i++) {
        const url = await uploadToCloudinary(composeImages[i].file, false);
        imgUrls.push(url);
      }
    } catch (e) {
      showToast('Image upload failed!');
      return;
    }
  }
  
  try {
    const postData = {
      uid: currentUser.uid,
      bgColor: currentPostBgColor,
      name: currentUserData.name || currentUser.email.split('@')[0],
      email: currentUserData.email || '',
      isVerified: currentUserData.isVerified || false,
      avatar: currentUserData.avatar || '',
      title: title,
      imgUrls: imgUrls,
      imgUrl: imgUrls[0] || '',
      likes: 0,
      likedBy: [],
      comments: [],
      tagged: currentTaggedFriends,
      taggedNames: currentTaggedNames,
      activity: currentPostActivity,
      isPinned: false,
      isReel: false,
      repostCount: 0,
      repostedBy: [],
      shares: 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      expiresAt: new Date(Date.now() + ONE_YEAR_MS)
    };
    
    const newPostRef = await db.collection('posts').add(postData);
    
    // Send notifications to tagged friends
    if (currentTaggedFriends && currentTaggedFriends.length > 0) {
      currentTaggedFriends.forEach(taggedUid => {
        if (taggedUid !== currentUser.uid) {
          db.collection('notifications').add({
            toUid: taggedUid,
            fromUid: currentUser.uid,
            fromName: currentUserData.name || 'User',
            type: 'tag',
            postId: newPostRef.id,
            read: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        }
      });
    }
    
    currentPostBgColor = 'default';
    closeCreatePost();
    showToast('Posted!');
    awardPoints(currentUser.uid, 20);
    
    // Refresh feed
    loadFeed();
    
  } catch (e) {
    console.error('Post error:', e);
    showToast('Error saving post.');
  }
}

// ===== TOGGLE LIKE =====
async function toggleLike(postId) {
  if (!currentUser || !checkRateLimit()) return;
  
  const ref = db.collection('posts').doc(postId);
  const doc = await ref.get();
  
  if (!doc.exists) return;
  
  const postData = doc.data();
  let likedBy = postData.likedBy || [];
  let likes = postData.likes || 0;
  
  if (likedBy.includes(currentUser.uid)) {
    // Unlike
    likedBy = likedBy.filter(id => id !== currentUser.uid);
    likes = Math.max(0, likes - 1);
  } else {
    // Like
    likedBy.push(currentUser.uid);
    likes++;
    
    // Send notification
    if (postData.uid !== currentUser.uid) {
      db.collection('notifications').add({
        toUid: postData.uid,
        fromUid: currentUser.uid,
        fromName: currentUserData.name,
        type: 'like',
        postId: postId,
        read: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      awardPoints(postData.uid, 5);
    }
  }
  
  await ref.update({ likes, likedBy });
}

// ===== OPEN COMMENT PANEL =====
function openCommentPanel(postId) {
  activeCommentPostId = postId;
  document.getElementById('comment-panel').classList.add('open');
  loadComments(postId);
}

// ===== CLOSE COMMENT PANEL =====
function closeCommentPanel() {
  document.getElementById('comment-panel').classList.remove('close');
  activeCommentPostId = null;
  if (commentPanelListener) {
    commentPanelListener();
    commentPanelListener = null;
  }
}

// ===== LOAD COMMENTS =====
async function loadComments(postId) {
  const list = document.getElementById('comments-list');
  if (!list) return;
  
  try {
    const doc = await db.collection('posts').doc(postId).get();
    if (!doc.exists) return;
    
    const postData = doc.data();
    const comments = postData.comments || [];
    
    if (comments.length === 0) {
      list.innerHTML = '<div class="empty-feed">No comments yet</div>';
      return;
    }
    
    let html = '';
    comments.forEach((comment, idx) => {
      const safeName = escapeHTML(comment.name || 'User');
      const av = comment.avatar ? `<img src="${escapeHTML(comment.avatar)}">` : avatarInitial(safeName);
      const vBadge = getVerifiedBadge(comment.email, comment.isVerified);
      
      html += `
        <div class="comment-item">
          <div class="avatar sm">${av}</div>
          <div class="comment-content">
            <div class="comment-author">${safeName} ${vBadge}</div>
            <div class="comment-text">${escapeHTML(comment.text || '')}</div>
            <div class="comment-time">${getRelativeTime({ seconds: comment.time / 1000 })}</div>
          </div>
        </div>
      `;
    });
    
    list.innerHTML = html;
    
  } catch (e) {
    console.error('Load comments error:', e);
    list.innerHTML = '<div class="empty-feed">Failed to load comments</div>';
  }
}

// ===== SUBMIT COMMENT =====
async function submitComment() {
  const input = document.getElementById('comment-input');
  const text = input.value.trim();
  
  if (!text || !activeCommentPostId || !checkRateLimit()) return;
  
  try {
    const ref = db.collection('posts').doc(activeCommentPostId);
    const docSnap = await ref.get();
    
    if (!docSnap.exists) return;
    
    const comments = docSnap.data().comments || [];
    const newComment = {
      uid: currentUser.uid,
      name: currentUserData.name || 'User',
      avatar: currentUserData.avatar || '',
      email: currentUserData.email || '',
      isVerified: currentUserData.isVerified || false,
      text: text,
      time: Date.now()
    };
    
    comments.push(newComment);
    await ref.update({ comments });
    
    // Send notification
    if (docSnap.data().uid !== currentUser.uid) {
      db.collection('notifications').add({
        toUid: docSnap.data().uid,
        fromUid: currentUser.uid,
        fromName: currentUserData.name,
        type: 'comment',
        postId: activeCommentPostId,
        read: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      awardPoints(docSnap.data().uid, 10);
    }
    
    input.value = '';
    loadComments(activeCommentPostId);
    showToast('Comment added!');
    
  } catch (e) {
    console.error('Comment error:', e);
    showToast('Failed to add comment');
  }
}

// ===== DELETE POST =====
async function deletePost(postId) {
  if (!confirm('Delete this post?')) return;
  
  try {
    await db.collection('posts').doc(postId).delete();
    showToast('Post deleted');
    closeAllDropdowns();
    loadMyPosts();
  } catch (e) {
    showToast('Failed to delete post');
  }
}

// ===== PIN POST =====
async function pinPost(postId) {
  closeAllDropdowns();
  
  try {
    const ref = db.collection('posts').doc(postId);
    const doc = await ref.get();
    
    if (doc.exists) {
      const isPinned = doc.data().isPinned || false;
      await ref.update({ isPinned: !isPinned });
      showToast(isPinned ? 'Post unpinned' : 'Post pinned!');
      loadMyPosts();
    }
  } catch (e) {
    showToast('Failed to pin post');
  }
}

// ===== MARK INTERESTED (SAVE POST) =====
async function markInterested(postId) {
  closeAllDropdowns();
  
  if (!currentUser) return;
  
  if (!currentUserData.savedPosts) currentUserData.savedPosts = [];
  
  if (!currentUserData.savedPosts.includes(postId)) {
    currentUserData.savedPosts.push(postId);
    showToast('Saving post...');
    
    try {
      await db.collection('users').doc(currentUser.uid).update({
        savedPosts: firebase.firestore.FieldValue.arrayUnion(postId)
      });
      showToast('Marked as Interested & Saved!');
    } catch (e) {
      console.error('Error saving post:', e);
      showToast('Failed to save post');
    }
  } else {
    showToast('Already saved in your list!');
  }
}

// ===== UNSAVE POST =====
async function unsavePost(postId) {
  closeAllDropdowns();
  
  if (!currentUser || !currentUserData.savedPosts) return;
  
  try {
    await db.collection('users').doc(currentUser.uid).update({
      savedPosts: firebase.firestore.FieldValue.arrayRemove(postId)
    });
    
    currentUserData.savedPosts = currentUserData.savedPosts.filter(id => id !== postId);
    showToast('Removed from saved');
  } catch (e) {
    showToast('Failed to remove');
  }
}

// ===== TOGGLE POST DROPDOWN =====
function togglePostDropdown(dropId) {
  event.stopPropagation();
  const dropdown = document.getElementById(dropId);
  
  if (!dropdown) return;
  
  // Close all other dropdowns
  closeAllDropdowns();
  
  // Toggle this one
  dropdown.classList.toggle('open');
}

// ===== CLOSE ALL DROPDOWNS =====
function closeAllDropdowns() {
  document.querySelectorAll('.post-dropdown-menu, .chat-dropdown-menu, .profile-menu, .chat-list-menu').forEach(menu => {
    menu.classList.remove('open');
  });
}

console.log('✅ Module 04: Posts System loaded');
// ═══════════════════════════════════════════════════════
//  MODULE 05: Stories System
// GoChat Fresh Rebuild 2026
// ═══════════════════════════════════════════════════════

// ===== LOAD STORIES =====
async function loadStories() {
  const storiesList = document.getElementById('stories-list');
  if (!storiesList) return;
  
  try {
    // Load stories from followed users
    const following = currentUserData?.following || [];
    const allUsers = [...following, currentUser.uid];
    
    const storiesSnap = await db.collection('stories')
      .where('uid', 'in', allUsers.slice(0, 10))
      .where('createdAt', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
      .orderBy('createdAt', 'desc')
      .get();
    
    if (storiesSnap.empty) {
      storiesList.innerHTML = `
        <div class="story-item" onclick="openCreateStory()">
          <div class="story-avatar-wrap add-story">
            <div class="avatar sm">
              ${currentUserData?.avatar ? `<img src="${escapeHTML(currentUserData.avatar)}">` : avatarInitial(currentUserData?.name || 'U')}
            </div>
            <div class="story-add-btn">
              <span class="material-symbols-outlined" style="font-size:16px;">add</span>
            </div>
          </div>
          <div class="story-username">Your story</div>
        </div>
      `;
      return;
    }
    
    // Group stories by user
    const storiesByUser = {};
    storiesSnap.forEach(doc => {
      const story = doc.data();
      if (!storiesByUser[story.uid]) {
        storiesByUser[story.uid] = [];
      }
      storiesByUser[story.uid].push({ id: doc.id, ...story });
    });
    
    let html = `
      <div class="story-item" onclick="openCreateStory()">
        <div class="story-avatar-wrap add-story">
          <div class="avatar sm">
            ${currentUserData?.avatar ? `<img src="${escapeHTML(currentUserData.avatar)}">` : avatarInitial(currentUserData?.name || 'U')}
          </div>
          <div class="story-add-btn">
            <span class="material-symbols-outlined" style="font-size:16px;">add</span>
          </div>
        </div>
        <div class="story-username">Your story</div>
      </div>
    `;
    
    Object.keys(storiesByUser).forEach(uid => {
      const userStories = storiesByUser[uid];
      const firstStory = userStories[0];
      const user = allUsersCache?.find(u => u.id === uid) || firstStory;
      const safeName = escapeHTML(user.name || 'User');
      const av = user.avatar ? `<img src="${escapeHTML(user.avatar)}">` : avatarInitial(safeName);
      
      html += `
        <div class="story-item" onclick="viewStory('${uid}', ${JSON.stringify(userStories.map(s => s.id))})">
          <div class="story-avatar-wrap">
            <div class="avatar sm">${av}</div>
          </div>
          <div class="story-username">${safeName}</div>
        </div>
      `;
    });
    
    storiesList.innerHTML = html;
    
  } catch (e) {
    console.error('Load stories error:', e);
  }
}

// ===== OPEN CREATE STORY =====
function openCreateStory() {
  const modal = document.getElementById('create-story-modal');
  if (modal) {
    modal.classList.add('open');
  } else {
    showToast('Story creation coming soon!');
  }
}

// ===== CLOSE CREATE STORY =====
function closeCreateStory() {
  const modal = document.getElementById('create-story-modal');
  if (modal) {
    modal.classList.remove('open');
  }
}

// ===== VIEW STORY =====
async function viewStory(uid, storyIds) {
  if (!storyIds || storyIds.length === 0) return;
  
  const viewer = document.getElementById('story-viewer');
  if (!viewer) return;
  
  viewer.classList.add('open');
  
  // Load story data
  const stories = [];
  for (const storyId of storyIds) {
    const doc = await db.collection('stories').doc(storyId).get();
    if (doc.exists) {
      stories.push({ id: doc.id, ...doc.data() });
    }
  }
  
  if (stories.length === 0) {
    closeStory();
    return;
  }
  
  // Display first story
  displayStory(stories, 0);
}

// ===== DISPLAY STORY =====
function displayStory(stories, index) {
  if (index >= stories.length) {
    closeStory();
    return;
  }
  
  const story = stories[index];
  const user = allUsersCache?.find(u => u.id === story.uid);
  
  // Update header
  const av = user?.avatar ? `<img src="${escapeHTML(user.avatar)}">` : avatarInitial(user?.name || 'U');
  document.getElementById('sv-avatar').innerHTML = av;
  document.getElementById('sv-username').textContent = user?.name || 'User';
  document.getElementById('sv-time').textContent = getRelativeTime(story.createdAt);
  
  // Display media
  const container = document.getElementById('sv-media-container');
  if (story.type === 'image') {
    container.innerHTML = `<img src="${escapeHTML(story.url)}" style="max-width:100%;max-height:100%;object-fit:contain;">`;
  } else if (story.type === 'video') {
    container.innerHTML = `<video src="${escapeHTML(story.url)}" autoplay loop style="max-width:100%;max-height:100%;object-fit:contain;"></video>`;
  } else if (story.type === 'text') {
    container.innerHTML = `
      <div style="background:${story.bgColor || 'var(--gradient)'};width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:40px;">
        <div style="color:#fff;font-size:24px;font-weight:700;text-align:center;">${escapeHTML(story.text || '')}</div>
      </div>
    `;
  }
  
  // Auto-advance after 5 seconds
  if (storyTimer) clearTimeout(storyTimer);
  storyTimer = setTimeout(() => {
    displayStory(stories, index + 1);
  }, 5000);
}

// ===== CLOSE STORY =====
function closeStory() {
  const viewer = document.getElementById('story-viewer');
  if (viewer) {
    viewer.classList.remove('open');
  }
  if (storyTimer) {
    clearTimeout(storyTimer);
    storyTimer = null;
  }
}

// ===== SUBMIT STORY =====
async function submitStory(type, url, text, bgColor) {
  if (!checkRateLimit()) return;
  
  try {
    const storyData = {
      uid: currentUser.uid,
      type: type,
      url: url || '',
      text: text || '',
      bgColor: bgColor || '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    };
    
    await db.collection('stories').add(storyData);
    showToast('Story posted!');
    closeCreateStory();
    loadStories();
    
  } catch (e) {
    console.error('Story error:', e);
    showToast('Failed to post story');
  }
}

console.log('✅ Module 05: Stories System loaded');
// ═══════════════════════════════════════════════════════
// 🚀 MODULE 06: Chat System
// GoChat Fresh Rebuild 2026
// ═══════════════════════════════════════════════════════

// ===== LOAD CHAT LIST =====
async function loadChatList() {
  const chatList = document.getElementById('chat-list');
  if (!chatList) return;
  
  try {
    const chatsSnap = await db.collection('chats')
      .where('participants', 'array-contains', currentUser.uid)
      .orderBy('lastAt', 'desc')
      .get();
    
    if (chatsSnap.empty) {
      chatList.innerHTML = '<div class="empty-feed"><span class="material-symbols-outlined">chat_bubble</span>No chats yet</div>';
      return;
    }
    
    let html = '';
    chatsSnap.forEach(doc => {
      const chat = doc.data();
      const otherUid = chat.participants.find(uid => uid !== currentUser.uid);
      const otherUser = allUsersCache?.find(u => u.id === otherUid);
      const safeName = escapeHTML(chat.groupName || otherUser?.name || 'User');
      const av = chat.groupAvatar || otherUser?.avatar || '';
      const avHtml = av ? `<img src="${escapeHTML(av)}">` : avatarInitial(safeName);
      const lastMsg = chat.lastMsg || 'New chat';
      const lastTime = chat.lastAt ? getRelativeTime(chat.lastAt) : '';
      const unreadClass = !chat.isRead && chat.lastSender !== currentUser.uid ? 'unread-chat' : '';
      
      html += `
        <div class="chat-item ${unreadClass}" onclick="openChat('${doc.id}', '${otherUid || 'group'}', '${safeName}', '${escapeHTML(av)}')">
          <div class="avatar sm">${avHtml}</div>
          <div class="chat-item-info">
            <div class="chat-item-name">${safeName}</div>
            <div class="chat-item-last-msg">${escapeHTML(lastMsg)}</div>
          </div>
          <div class="chat-item-time">${lastTime}</div>
        </div>
      `;
    });
    
    chatList.innerHTML = html;
    
  } catch (e) {
    console.error('Load chat list error:', e);
    chatList.innerHTML = '<div class="empty-feed">Failed to load chats</div>';
  }
}

// ===== OPEN CHAT =====
async function openChat(chatId, otherUid, otherName, otherAvatar) {
  currentChatId = chatId;
  currentChatOtherUid = otherUid;
  
  // Update chat header
  document.getElementById('chat-name').textContent = otherName;
  const avHtml = otherAvatar ? `<img src="${escapeHTML(otherAvatar)}">` : avatarInitial(otherName);
  document.getElementById('chat-avatar').innerHTML = avHtml;
  
  // Show chat page
  showPage('chat');
  
  // Load messages
  loadMessages(chatId);
  
  // Mark as read
  try {
    await db.collection('chats').doc(chatId).update({ isRead: true });
  } catch (e) {
    console.error('Mark read error:', e);
  }
}

// ===== CLOSE CHAT =====
function closeChat() {
  currentChatId = null;
  currentChatOtherUid = null;
  showPage('messages');
  loadChatList();
}

// ===== LOAD MESSAGES =====
async function loadMessages(chatId) {
  const messagesList = document.getElementById('chat-messages');
  if (!messagesList) return;
  
  // Unsubscribe from previous listener
  if (chatUnsub) {
    chatUnsub();
  }
  
  chatUnsub = db.collection('chats').doc(chatId)
    .collection('messages')
    .orderBy('createdAt', 'asc')
    .onSnapshot(snapshot => {
      let html = '';
      snapshot.forEach(doc => {
        const msg = doc.data();
        const isMine = msg.uid === currentUser.uid;
        const safeText = escapeHTML(msg.text || '');
        const time = msg.createdAt ? getRelativeTime(msg.createdAt) : '';
        
        html += `
          <div class="chat-bubble-wrapper ${isMine ? 'mine' : 'theirs'}">
            <div class="chat-bubble ${isMine ? 'mine' : 'theirs'}">
              ${safeText}
              ${msg.imageUrl ? `<img src="${escapeHTML(msg.imageUrl)}" onclick="openImageZoom('${escapeHTML(msg.imageUrl)}')">` : ''}
            </div>
            <div class="chat-bubble-time">${time}</div>
          </div>
        `;
      });
      
      messagesList.innerHTML = html;
      messagesList.scrollTop = messagesList.scrollHeight;
    });
}

// ===== SEND MESSAGE =====
async function sendMsg() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  
  if (!text || !currentChatId || !checkRateLimit()) return;
  
  input.value = '';
  
  try {
    const msgData = {
      uid: currentUser.uid,
      text: text,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    await db.collection('chats').doc(currentChatId)
      .collection('messages')
      .add(msgData);
    
    // Update last message
    await db.collection('chats').doc(currentChatId).update({
      lastMsg: text,
      lastAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastSender: currentUser.uid,
      isRead: false
    });
    
  } catch (e) {
    console.error('Send message error:', e);
    showToast('Failed to send message');
  }
}

// ===== HANDLE TYPING =====
function handleTyping() {
  if (typingTimeout) clearTimeout(typingTimeout);
  
  typingTimeout = setTimeout(async () => {
    if (!currentChatId) return;
    
    try {
      await db.collection('chats').doc(currentChatId).update({
        typing: currentUser.uid,
        typingAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (e) {
      console.error('Typing error:', e);
    }
  }, 1000);
}

// ===== UPLOAD CHAT IMAGE =====
async function uploadChatImage(event) {
  const file = event.target.files[0];
  if (!file || !currentChatId) return;
  
  if (file.size > MAX_FILE_SIZE) {
    showToast('Image too large (max 5MB)');
    return;
  }
  
  try {
    showToast('Uploading...');
    const url = await uploadToCloudinary(file, false);
    
    const msgData = {
      uid: currentUser.uid,
      imageUrl: url,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    await db.collection('chats').doc(currentChatId)
      .collection('messages')
      .add(msgData);
    
    await db.collection('chats').doc(currentChatId).update({
      lastMsg: '📷 Photo',
      lastAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastSender: currentUser.uid,
      isRead: false
    });
    
    showToast('Image sent!');
    event.target.value = '';
    
  } catch (e) {
    console.error('Upload error:', e);
    showToast('Failed to upload image');
  }
}

// ===== START VOICE RECORD =====
let mediaRecorder = null;
let audioChunks = [];

function startVoiceRecord() {
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];
      
      mediaRecorder.ondataavailable = event => {
        audioChunks.push(event.data);
      };
      
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        await sendVoiceMessage(audioBlob);
      };
      
      mediaRecorder.start();
      document.getElementById('recording-ui').style.display = 'flex';
      
      // Start timer
      let seconds = 0;
      const timer = setInterval(() => {
        seconds++;
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        document.getElementById('record-time').textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
      }, 1000);
      
      mediaRecorder.onstop = () => clearInterval(timer);
      
    })
    .catch(err => {
      console.error('Microphone error:', err);
      showToast('Microphone access denied');
    });
}

// ===== SEND VOICE MESSAGE =====
async function sendVoiceMessage(audioBlob) {
  if (!currentChatId) return;
  
  try {
    showToast('Uploading voice...');
    const url = await uploadToCloudinary(audioBlob, true);
    
    const msgData = {
      uid: currentUser.uid,
      audioUrl: url,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    await db.collection('chats').doc(currentChatId)
      .collection('messages')
      .add(msgData);
    
    await db.collection('chats').doc(currentChatId).update({
      lastMsg: '🎤 Voice message',
      lastAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastSender: currentUser.uid,
      isRead: false
    });
    
    showToast('Voice sent!');
    document.getElementById('recording-ui').style.display = 'none';
    
  } catch (e) {
    console.error('Voice upload error:', e);
    showToast('Failed to send voice');
  }
}

// ===== CANCEL VOICE RECORD =====
function cancelVoiceRecord() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  document.getElementById('recording-ui').style.display = 'none';
}

console.log('✅ Module 06: Chat System loaded');
// ══════════════════════════════════════════════════════
// 🚀 MODULE 07: Profile System
// GoChat Fresh Rebuild 2026
// ═══════════════════════════════════════════════════════

// ===== LOAD MY PROFILE =====
async function loadMyProfile() {
  if (!currentUser || !currentUserData) return;
  
  const av = currentUserData.avatar ? `<img src="${escapeHTML(currentUserData.avatar)}">` : avatarInitial(currentUserData.name || 'U');
  document.getElementById('profile-avatar').innerHTML = av;
  document.getElementById('profile-name').textContent = currentUserData.name || 'User';
  document.getElementById('profile-username').textContent = currentUserData.username ? `@${currentUserData.username}` : '';
  document.getElementById('my-followers-count').textContent = currentUserData.followers?.length || 0;
  document.getElementById('my-following-count').textContent = currentUserData.following?.length || 0;
  document.getElementById('profile-bio-display').textContent = currentUserData.bio || '';
  
  // Load personal details
  let detailsHtml = '';
  if (currentUserData.gender) detailsHtml += `<div class="detail-item"><span class="material-symbols-outlined">person</span>${escapeHTML(currentUserData.gender)}</div>`;
  if (currentUserData.relationship) detailsHtml += `<div class="detail-item"><span class="material-symbols-outlined">favorite</span>${escapeHTML(currentUserData.relationship)}</div>`;
  if (currentUserData.profession) detailsHtml += `<div class="detail-item"><span class="material-symbols-outlined">work</span>${escapeHTML(currentUserData.profession)}</div>`;
  if (currentUserData.livesIn) detailsHtml += `<div class="detail-item"><span class="material-symbols-outlined">location_on</span>Lives in ${escapeHTML(currentUserData.livesIn)}</div>`;
  if (currentUserData.from) detailsHtml += `<div class="detail-item"><span class="material-symbols-outlined">home</span>From ${escapeHTML(currentUserData.from)}</div>`;
  
  document.getElementById('profile-details-display').innerHTML = detailsHtml;
  
  // Load my posts
  loadMyPosts();
}

// ===== LOAD MY POSTS =====
async function loadMyPosts() {
  const postsList = document.getElementById('profile-posts-list');
  if (!postsList) return;
  
  try {
    const postsSnap = await db.collection('posts')
      .where('uid', '==', currentUser.uid)
      .orderBy('createdAt', 'desc')
      .get();
    
    if (postsSnap.empty) {
      postsList.innerHTML = '<div class="empty-feed"><span class="material-symbols-outlined">photo_camera</span>No posts yet</div>';
      return;
    }
    
    let html = '<div class="profile-photo-grid">';
    postsSnap.forEach(doc => {
      const post = doc.data();
      const imgUrl = post.imgUrl || post.imgUrls?.[0] || '';
      if (imgUrl) {
        html += `
          <div class="grid-post-item" onclick="openSinglePostView('${doc.id}')">
            <img src="${escapeHTML(imgUrl)}">
          </div>
        `;
      }
    });
    html += '</div>';
    
    postsList.innerHTML = html;
    
  } catch (e) {
    console.error('Load my posts error:', e);
    postsList.innerHTML = '<div class="empty-feed">Failed to load posts</div>';
  }
}

// ===== VIEW OTHER USER PROFILE =====
async function viewUserProfile(uid) {
  if (!uid || uid === currentUser.uid) {
    showPage('profile');
    return;
  }
  
  currentOtherProfileUid = uid;
  
  try {
    const doc = await db.collection('users').doc(uid).get();
    if (!doc.exists) {
      showToast('User not found');
      return;
    }
    
    const user = doc.data();
    const av = user.avatar ? `<img src="${escapeHTML(user.avatar)}">` : avatarInitial(user.name || 'U');
    document.getElementById('other-profile-avatar').innerHTML = av;
    document.getElementById('other-profile-name').textContent = user.name || 'User';
    document.getElementById('other-profile-username').textContent = user.username ? `@${user.username}` : '';
    document.getElementById('other-followers-count').textContent = user.followers?.length || 0;
    document.getElementById('other-following-count').textContent = user.following?.length || 0;
    document.getElementById('other-profile-bio').textContent = user.bio || '';
    
    // Update follow button
    const isFollowing = currentUserData?.following?.includes(uid);
    const followBtn = document.getElementById('follow-btn');
    if (isFollowing) {
      followBtn.innerHTML = '<span class="material-symbols-outlined">person_check</span> Following';
    } else {
      followBtn.innerHTML = '<span class="material-symbols-outlined">person_add</span> Follow';
    }
    
    // Load other user posts
    loadOtherUserPosts(uid);
    
    showPage('other-profile');
    
  } catch (e) {
    console.error('View profile error:', e);
    showToast('Failed to load profile');
  }
}

// ===== CLOSE OTHER PROFILE =====
function closeOtherProfile() {
  currentOtherProfileUid = null;
  showPage('feed');
}

// ===== LOAD OTHER USER POSTS =====
async function loadOtherUserPosts(uid) {
  const postsList = document.getElementById('other-profile-posts-list');
  if (!postsList) return;
  
  try {
    const postsSnap = await db.collection('posts')
      .where('uid', '==', uid)
      .orderBy('createdAt', 'desc')
      .get();
    
    if (postsSnap.empty) {
      postsList.innerHTML = '<div class="empty-feed"><span class="material-symbols-outlined">photo_camera</span>No posts yet</div>';
      return;
    }
    
    let html = '<div class="profile-photo-grid">';
    postsSnap.forEach(doc => {
      const post = doc.data();
      const imgUrl = post.imgUrl || post.imgUrls?.[0] || '';
      if (imgUrl) {
        html += `
          <div class="grid-post-item" onclick="openSinglePostView('${doc.id}')">
            <img src="${escapeHTML(imgUrl)}">
          </div>
        `;
      }
    });
    html += '</div>';
    
    postsList.innerHTML = html;
    
  } catch (e) {
    console.error('Load other posts error:', e);
    postsList.innerHTML = '<div class="empty-feed">Failed to load posts</div>';
  }
}

// ===== TOGGLE FOLLOW =====
async function toggleFollow(uid) {
  if (!currentUser || uid === currentUser.uid || !checkRateLimit()) return;
  
  try {
    const isFollowing = currentUserData?.following?.includes(uid);
    
    if (isFollowing) {
      // Unfollow
      await db.collection('users').doc(currentUser.uid).update({
        following: firebase.firestore.FieldValue.arrayRemove(uid)
      });
      await db.collection('users').doc(uid).update({
        followers: firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
      });
      currentUserData.following = currentUserData.following.filter(id => id !== uid);
      showToast('Unfollowed');
    } else {
      // Follow
      await db.collection('users').doc(currentUser.uid).update({
        following: firebase.firestore.FieldValue.arrayUnion(uid)
      });
      await db.collection('users').doc(uid).update({
        followers: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
      });
      currentUserData.following = [...(currentUserData.following || []), uid];
      
      // Send notification
      db.collection('notifications').add({
        toUid: uid,
        fromUid: currentUser.uid,
        fromName: currentUserData.name,
        type: 'follow',
        read: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      showToast('Followed!');
    }
    
    // Update UI
    const followBtn = document.getElementById('follow-btn');
    if (followBtn) {
      const nowFollowing = !isFollowing;
      followBtn.innerHTML = nowFollowing 
        ? '<span class="material-symbols-outlined">person_check</span> Following'
        : '<span class="material-symbols-outlined">person_add</span> Follow';
    }
    
  } catch (e) {
    console.error('Follow error:', e);
    showToast('Failed to update follow status');
  }
}

// ===== OPEN EDIT PROFILE =====
function openEditProfile() {
  document.getElementById('edit-name').value = currentUserData?.name || '';
  document.getElementById('edit-bio').value = currentUserData?.bio || '';
  document.getElementById('edit-gender').value = currentUserData?.gender || '';
  document.getElementById('edit-relationship').value = currentUserData?.relationship || '';
  document.getElementById('edit-profession').value = currentUserData?.profession || '';
  document.getElementById('edit-lives').value = currentUserData?.livesIn || '';
  document.getElementById('edit-from').value = currentUserData?.from || '';
  
  document.getElementById('edit-profile-modal').classList.add('open');
}

// ===== CLOSE EDIT PROFILE =====
function closeEditProfile() {
  document.getElementById('edit-profile-modal').classList.remove('open');
}

// ===== SAVE PROFILE =====
async function saveProfile() {
  if (!checkRateLimit()) return;
  
  const updates = {
    name: document.getElementById('edit-name').value.trim(),
    bio: document.getElementById('edit-bio').value.trim(),
    gender: document.getElementById('edit-gender').value,
    relationship: document.getElementById('edit-relationship').value,
    profession: document.getElementById('edit-profession').value.trim(),
    livesIn: document.getElementById('edit-lives').value.trim(),
    from: document.getElementById('edit-from').value.trim()
  };
  
  try {
    await db.collection('users').doc(currentUser.uid).update(updates);
    Object.assign(currentUserData, updates);
    showToast('Profile updated!');
    closeEditProfile();
    loadMyProfile();
    
  } catch (e) {
    console.error('Save profile error:', e);
    showToast('Failed to update profile');
  }
}

// ===== UPLOAD AVATAR =====
async function uploadAvatar(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  if (file.size > MAX_FILE_SIZE) {
    showToast('Image too large (max 5MB)');
    return;
  }
  
  try {
    showToast('Uploading...');
    const url = await uploadToCloudinary(file, false);
    
    await db.collection('users').doc(currentUser.uid).update({
      avatar: url
    });
    
    currentUserData.avatar = url;
    updateNavProfile();
    loadMyProfile();
    showToast('Avatar updated!');
    
  } catch (e) {
    console.error('Avatar upload error:', e);
    showToast('Failed to upload avatar');
  }
}

console.log('✅ Module 07: Profile System loaded');
// ═══════════════════════════════════════════════════════
//  MODULE 08: Advanced Features
// GoChat Fresh Rebuild 2026
// ══════════════════════════════════════════════════════

// ===== LOAD NOTIFICATIONS =====
async function loadNotifications() {
  const notifList = document.getElementById('notifications-list');
  if (!notifList) return;
  
  try {
    const notifSnap = await db.collection('notifications')
      .where('toUid', '==', currentUser.uid)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    
    if (notifSnap.empty) {
      notifList.innerHTML = '<div class="empty-feed"><span class="material-symbols-outlined">notifications</span>No notifications</div>';
      return;
    }
    
    let html = '';
    notifSnap.forEach(doc => {
      const notif = doc.data();
      const safeName = escapeHTML(notif.fromName || 'User');
      const time = notif.createdAt ? getRelativeTime(notif.createdAt) : '';
      const unreadClass = !notif.read ? 'unread' : '';
      
      let icon = 'notifications';
      if (notif.type === 'like') icon = 'favorite';
      else if (notif.type === 'comment') icon = 'chat_bubble';
      else if (notif.type === 'follow') icon = 'person_add';
      else if (notif.type === 'tag') icon = 'sell';
      
      html += `
        <div class="notif-item ${unreadClass}" onclick="handleNotificationClick('${doc.id}', '${notif.type}', '${notif.postId || ''}')">
          <div class="avatar sm">
            <span class="material-symbols-outlined">${icon}</span>
          </div>
          <div class="notif-content">
            <div class="notif-text">${safeName} ${notif.type || 'notified'} you</div>
            <div class="notif-time">${time}</div>
          </div>
        </div>
      `;
    });
    
    notifList.innerHTML = html;
    
    // Update badge
    const unreadCount = notifSnap.docs.filter(d => !d.data().read).length;
    const badge = document.getElementById('notif-badge');
    if (badge) {
      if (unreadCount > 0) {
        badge.textContent = unreadCount;
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    }
    
  } catch (e) {
    console.error('Load notifications error:', e);
    notifList.innerHTML = '<div class="empty-feed">Failed to load notifications</div>';
  }
}

// ===== HANDLE NOTIFICATION CLICK =====
async function handleNotificationClick(notifId, type, postId) {
  try {
    await db.collection('notifications').doc(notifId).update({ read: true });
    
    if (postId) {
      openSinglePostView(postId);
    } else if (type === 'follow') {
      showPage('friends');
    }
    
    loadNotifications();
    
  } catch (e) {
    console.error('Notification click error:', e);
  }
}

// ===== SEARCH USERS =====
async function handleSearch(query) {
  const resultsDiv = document.getElementById('search-results');
  if (!resultsDiv) return;
  
  if (!query || query.length < 2) {
    resultsDiv.innerHTML = '';
    return;
  }
  
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(async () => {
    try {
      const usersSnap = await db.collection('users')
        .where('name', '>=', query)
        .where('name', '<=', query + '\uf8ff')
        .limit(20)
        .get();
      
      if (usersSnap.empty) {
        resultsDiv.innerHTML = '<div class="empty-feed">No users found</div>';
        return;
      }
      
      let html = '';
      usersSnap.forEach(doc => {
        const user = doc.data();
        const safeName = escapeHTML(user.name || 'User');
        const av = user.avatar ? `<img src="${escapeHTML(user.avatar)}">` : avatarInitial(safeName);
        
        html += `
          <div class="chat-item" onclick="viewUserProfile('${doc.id}')">
            <div class="avatar sm">${av}</div>
            <div class="chat-item-info">
              <div class="chat-item-name">${safeName}</div>
              <div class="chat-item-last-msg">${user.username ? '@' + user.username : ''}</div>
            </div>
          </div>
        `;
      });
      
      resultsDiv.innerHTML = html;
      
    } catch (e) {
      console.error('Search error:', e);
      resultsDiv.innerHTML = '<div class="empty-feed">Search failed</div>';
    }
  }, 300);
}

// ===== OPEN LEADERBOARD =====
async function openLeaderboard() {
  const modal = document.getElementById('leaderboard-modal');
  if (!modal) return;
  
  modal.classList.add('open');
  
  const content = document.getElementById('leaderboard-content');
  if (!content) return;
  
  content.innerHTML = '<div class="loading"><span class="material-symbols-outlined">autorenew</span>Loading...</div>';
  
  try {
    const usersSnap = await db.collection('users')
      .orderBy('points', 'desc')
      .limit(100)
      .get();
    
    let html = '';
    let rank = 1;
    usersSnap.forEach(doc => {
      const user = doc.data();
      const safeName = escapeHTML(user.name || 'User');
      const av = user.avatar ? `<img src="${escapeHTML(user.avatar)}">` : avatarInitial(safeName);
      const points = user.points || 0;
      
      let medal = '';
      if (rank === 1) medal = '🥇';
      else if (rank === 2) medal = '🥈';
      else if (rank === 3) medal = '🥉';
      else medal = `#${rank}`;
      
      html += `
        <div class="chat-item">
          <div style="font-size:20px;font-weight:700;width:40px;text-align:center;">${medal}</div>
          <div class="avatar sm">${av}</div>
          <div class="chat-item-info">
            <div class="chat-item-name">${safeName}</div>
            <div class="chat-item-last-msg">${points} points</div>
          </div>
        </div>
      `;
      rank++;
    });
    
    content.innerHTML = html;
    
  } catch (e) {
    console.error('Leaderboard error:', e);
    content.innerHTML = '<div class="empty-feed">Failed to load leaderboard</div>';
  }
}

// ===== CLOSE LEADERBOARD =====
function closeLeaderboard() {
  const modal = document.getElementById('leaderboard-modal');
  if (modal) {
    modal.classList.remove('open');
  }
}

// ===== OPEN ELITE GOCHAT =====
function openEliteGoChat() {
  const modal = document.getElementById('elite-app-modal');
  if (modal) {
    modal.classList.add('open');
    // Load elite content
    loadEliteContent();
  }
}

// ===== CLOSE ELITE GOCHAT =====
function closeEliteGoChat() {
  const modal = document.getElementById('elite-app-modal');
  if (modal) {
    modal.classList.remove('open');
  }
}

// ===== LOAD ELITE CONTENT =====
function loadEliteContent() {
  const step1 = document.getElementById('app-step-1');
  if (step1) {
    step1.innerHTML = `
      <div style="text-align:center;padding:40px 20px;">
        <div style="width:80px;height:80px;background:var(--gradient-gold);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;">
          <span class="material-symbols-outlined" style="font-size:40px;color:#fff;">workspace_premium</span>
        </div>
        <h2 style="font-size:24px;font-weight:800;margin-bottom:12px;">Elite GoChat</h2>
        <p style="color:var(--text-secondary);margin-bottom:30px;">Unlock premium features and stand out!</p>
        <button class="btn-primary" onclick="nextAppStep(2)">Get Started</button>
      </div>
    `;
  }
}

// ===== NEXT APP STEP =====
function nextAppStep(step) {
  document.querySelectorAll('[id^="app-step-"]').forEach(el => {
    el.style.display = 'none';
  });
  const target = document.getElementById(`app-step-${step}`);
  if (target) {
    target.style.display = 'block';
  }
}

// ===== TOGGLE DARK MODE =====
function toggleDarkMode() {
  document.body.classList.toggle('light-mode');
  const isLight = document.body.classList.contains('light-mode');
  localStorage.setItem('gochat-theme', isLight ? 'light' : 'dark');
  showToast(isLight ? 'Light mode enabled' : 'Dark mode enabled');
}

// ===== OPEN MAIN MENU =====
function openMainMenu() {
  const menu = document.getElementById('main-menu-screen');
  if (menu) {
    menu.style.display = 'flex';
  }
}

// ===== CLOSE MAIN MENU =====
function closeMainMenu() {
  const menu = document.getElementById('main-menu-screen');
  if (menu) {
    menu.style.display = 'none';
  }
}

// ===== UTILITY: UPLOAD TO CLOUDINARY =====
async function uploadToCloudinary(file, isVideo) {
  const CLOUD_NAME = 'gochat';
  const UPLOAD_PRESET = 'gochat';
  
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', UPLOAD_PRESET);
  
  const resourceType = isVideo ? 'video' : 'image';
  const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`;
  
  const response = await fetch(url, {
    method: 'POST',
    body: formData
  });
  
  const data = await response.json();
  
  if (data.secure_url) {
    return data.secure_url;
  } else {
    throw new Error('Upload failed');
  }
}

// ===== UTILITY: OPEN IMAGE ZOOM =====
function openImageZoom(url) {
  const modal = document.getElementById('image-zoom-modal');
  if (modal) {
    const img = modal.querySelector('img');
    if (img) {
      img.src = url;
    }
    modal.classList.add('open');
  }
}

// ===== UTILITY: CLOSE IMAGE ZOOM =====
function closeImageZoom() {
  const modal = document.getElementById('image-zoom-modal');
  if (modal) {
    modal.classList.remove('open');
  }
}

// ===== UTILITY: OPEN SINGLE POST VIEW =====
async function openSinglePostView(postId) {
  const modal = document.getElementById('single-post-view');
  if (!modal) return;
  
  modal.classList.add('open');
  
  const content = document.getElementById('single-post-content');
  if (!content) return;
  
  content.innerHTML = '<div class="loading"><span class="material-symbols-outlined">autorenew</span>Loading...</div>';
  
  try {
    const doc = await db.collection('posts').doc(postId).get();
    if (!doc.exists) {
      content.innerHTML = '<div class="empty-feed">Post not found</div>';
      return;
    }
    
    const post = doc.data();
    content.innerHTML = buildPostCardHTML({ id: doc.id, ...post });
    
  } catch (e) {
    console.error('Load post error:', e);
    content.innerHTML = '<div class="empty-feed">Failed to load post</div>';
  }
}

// ===== UTILITY: CLOSE SINGLE POST VIEW =====
function closeSinglePostView() {
  const modal = document.getElementById('single-post-view');
  if (modal) {
    modal.classList.remove('open');
  }
}

// ===== UTILITY: OPEN SHARE MODAL =====
function openShareModal(postId, postTitle, postImage) {
  const modal = document.getElementById('share-modal');
  if (modal) {
    modal.classList.add('open');
    loadShareFriends(postId);
  }
}

// ===== UTILITY: CLOSE SHARE MODAL =====
function closeShareModal() {
  const modal = document.getElementById('share-modal');
  if (modal) {
    modal.classList.remove('open');
  }
}

// ===== UTILITY: LOAD SHARE FRIENDS =====
async function loadShareFriends(postId) {
  const list = document.getElementById('share-friends-list');
  if (!list) return;
  
  try {
    const friends = currentUserData?.following || [];
    let html = '';
    
    for (const uid of friends.slice(0, 20)) {
      const doc = await db.collection('users').doc(uid).get();
      if (doc.exists) {
        const user = doc.data();
        const safeName = escapeHTML(user.name || 'User');
        const av = user.avatar ? `<img src="${escapeHTML(user.avatar)}">` : avatarInitial(safeName);
        
        html += `
          <div class="chat-item" onclick="sharePostWithFriend('${postId}', '${uid}')">
            <div class="avatar sm">${av}</div>
            <div class="chat-item-info">
              <div class="chat-item-name">${safeName}</div>
            </div>
          </div>
        `;
      }
    }
    
    list.innerHTML = html || '<div class="empty-feed">No friends to share with</div>';
    
  } catch (e) {
    console.error('Load friends error:', e);
    list.innerHTML = '<div class="empty-feed">Failed to load friends</div>';
  }
}

// ===== UTILITY: SHARE POST WITH FRIEND =====
async function sharePostWithFriend(postId, friendUid) {
  try {
    // Create a chat if not exists
    const chatId = `${currentUser.uid}_${friendUid}`.split('_').sort().join('_');
    
    await db.collection('chats').doc(chatId).set({
      participants: [currentUser.uid, friendUid],
      lastMsg: 'Shared a post',
      lastAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastSender: currentUser.uid,
      isRead: false
    }, { merge: true });
    
    await db.collection('chats').doc(chatId).collection('messages').add({
      uid: currentUser.uid,
      text: 'Shared a post',
      sharedPostId: postId,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    showToast('Post shared!');
    closeShareModal();
    
  } catch (e) {
    console.error('Share error:', e);
    showToast('Failed to share');
  }
}

console.log('✅ Module 08: Advanced Features loaded');
console.log('🎉 All modules loaded successfully!');