// Blocked Accounts      
function openBlockedAccountsPage() {
    document.getElementById('blocked-accounts-screen').style.display = 'flex';
    //         
    if (typeof loadBlockedUsers === 'function') {
        loadBlockedUsers(); 
    }
}

function closeBlockedAccountsPage() {
    document.getElementById('blocked-accounts-screen').style.display = 'none';
}
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_IMAGES_PER_POST = 10;
const RATE_LIMIT_MS = 1000;
const SKELETON_HTML = `
<div class="skeleton-card">
    <div class="skeleton-header">
        <div class="skeleton-avatar"></div>
        <div class="skeleton-text-wrap">
            <div class="skeleton-text w-40"></div>
            <div class="skeleton-text w-20"></div>
        </div>
    </div>
    <div class="skeleton-box"></div>
</div>
<div class="skeleton-card">
    <div class="skeleton-header">
        <div class="skeleton-avatar"></div>
        <div class="skeleton-text-wrap">
            <div class="skeleton-text w-40"></div>
            <div class="skeleton-text w-20"></div>
        </div>
    </div>
    <div class="skeleton-box"></div>
</div>`;


// ===== FIREBASE INIT =====
firebase.initializeApp({
apiKey:"AIzaSyAnKueAHG8cw6O-Hy8U9fgGzH4fDMYQBy8",
authDomain:"gochat-3efa3.firebaseapp.com",
projectId:"gochat-3efa3",
storageBucket:"gochat-3efa3.firebasestorage.app",
messagingSenderId:"203332487017",
appId:"1:203332487017:web:06af0b8b4b12af89581ff8"
});
const auth=firebase.auth();
const db=firebase.firestore();
db.settings({ experimentalForceLongPolling: true });

// ===== STATE VARIABLES =====
let currentUser=null,currentUserData=null,currentChatId=null,currentChatOtherUid=null;
let feedUnsub=null,chatUnsub=null,notifUnsub=null,storyUnsub=null,onlineUnsub=null;
let activeCommentPostId=null,commentPanelListener=null;
let currentFeedTab='foryou';
let currentTaggedFriends=[];
let currentTaggedNames = [];
let currentPostActivity = null; //    
let currentEditPostId=null;
let activeStoryGroup=[];
let currentStoryIndex=0;
let storyTimer=null;
let composeImages=[];
let currentReplyMsgId=null;
let replyToMsgData=null; //  Reply Preview Data Store
let currentForwardMsgData=null;
let currentOtherProfileUid=null;
let onlineStatusInterval=null;
let typingTimeout=null;
let allUsersCache=null;
let usersCacheLoaded=false;
let isAppReadyForNotifs = false;
let usersCacheTimestamp=0;
let searchTimeout=null;
let postLimit = 10;
let isFriendsEditMode = false;
let friendsToDelete = [];
let lastActionTime = 0;

// ===== UTILITY FUNCTIONS =====
function escapeHTML(str){
if(!str)return'';
return String(str).replace(/[&<>"']/g,function(match){
const map={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
return map[match];
});
}

function checkRateLimit() {
const now = Date.now();
if (now - lastActionTime < RATE_LIMIT_MS) {
showToast('Please wait a moment...');
return false;
}
lastActionTime = now;
return true;
}

async function uploadToCloudinary(file,isVideo=false){
const formData=new FormData();
formData.append('file',file);
formData.append('upload_preset','gochat');
const endpoint=isVideo
?'https://api.cloudinary.com/v1_1/dsnqmwyvt/video/upload'
:'https://api.cloudinary.com/v1_1/dsnqmwyvt/image/upload';
const res=await fetch(endpoint,{method:'POST',body:formData});
const data=await res.json();
if(data.secure_url)return data.secure_url;
throw new Error('Upload failed');
}

async function fetchAllUsers(forceRefresh=false){
const now = Date.now();
if(usersCacheLoaded && !forceRefresh && (now - usersCacheTimestamp < 5 * 60 * 1000)){
return allUsersCache;
}
const snap=await db.collection('users').get();
allUsersCache=snap.docs.map(d=>({id:d.id,...d.data()}));
usersCacheLoaded=true;
usersCacheTimestamp = now;
return allUsersCache;
}

// ===  Dark Mode Toggle Logic ===
function toggleDarkMode() {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    
    //    
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    
    // UI  
    updateDarkModeUI();
    showToast(`Dark Mode is now ${isLight ? 'OFF' : 'ON'}`);
}

function updateDarkModeUI() {
    const toggleEl = document.getElementById('dark-mode-toggle');
    if (toggleEl) {
        const isLight = document.body.classList.contains('light-mode');
        if (!isLight) {
            toggleEl.classList.add('active'); //       
        } else {
            toggleEl.classList.remove('active'); //      
        }
    }
}

function toggleSettingsMenu(){
closeAllDropdowns();
document.getElementById('settings-menu').classList.toggle('open');
}

function toggleFabMenu(){
const fm=document.getElementById('fab-menu');
fm.classList.toggle('open');
}

function toggleProfileMenu(){
closeAllDropdowns();
document.getElementById('profile-menu').classList.toggle('open');
}

function closeAllDropdowns(){
document.querySelectorAll('.post-dropdown-menu,.settings-menu,.chat-list-menu,.profile-menu').forEach(m=>m.classList.remove('open'));
document.getElementById('fab-menu').classList.remove('open');
}

document.addEventListener('click',function(e){
if(!e.target.closest('.icon-btn')&&!e.target.closest('.more-btn')&&!e.target.closest('.msg-menu-btn')&&!e.target.closest('.post-dropdown-menu')&&!e.target.closest('.chat-list-menu')&&!e.target.closest('.profile-menu')&&!e.target.closest('.settings-menu')&&!e.target.closest('.nav-fab')){
closeAllDropdowns();
}
});

function showToast(msg){
const t=document.getElementById('toast');
t.textContent=msg;
t.classList.add('show');
setTimeout(()=>t.classList.remove('show'),2500);
}

function avatarInitial(name){return name?name[0].toUpperCase():'?';}

function getRelativeTime(ts){
if(!ts)return'Just now';
const ms=ts.toMillis?ts.toMillis():(ts.seconds?ts.seconds*1000:ts);
const diff=Date.now()-ms;
const m=Math.floor(diff/60000);
const h=Math.floor(diff/3600000);
if(m<1)return'Just now';
if(m<60)return m+'m ago';
if(h<24)return h+'h ago';
return Math.floor(h/24)+'d ago';
}

function getVerifiedBadge(email, isVerified) {
    //     isVerified: true   
    if (isVerified === true) {
        return '<span class="material-symbols-outlined verified-icon" title="Verified">verified</span>';
    }
    return '';
}

function openSettingsPrivacy(){
  //      
  const oldMenu = document.getElementById('settings-menu');
  if(oldMenu) oldMenu.classList.remove('open');
  
  document.getElementById('settings-privacy-screen').classList.add('open');
  const el = document.getElementById('contact-email-display');
  if(el) el.textContent = currentUser ? currentUser.email : 'Not logged in';
  
  //    
  loadBlockedUsers(); 
  renderLinkedAccountsUI(); //    
}

function closeSettingsPrivacy(){
  document.getElementById('settings-privacy-screen').classList.remove('open');
}


// ===== POINT SYSTEM =====
async function awardPoints(uid, amount) {
if(!uid || !amount) return;
try {
await db.collection('users').doc(uid).update({
points: firebase.firestore.FieldValue.increment(amount)
});
if(currentUser && uid === currentUser.uid && currentUserData) {
currentUserData.points = (currentUserData.points || 0) + amount;
}
} catch(e) {
console.log("Error awarding points", e);
}
}

// ==========================================
//  PREMIUM LEADERBOARD (same data, new look)
// ==========================================
function formatLBNum(n){
  n = n || 0;
  if(n >= 1000000) return (n/1000000).toFixed(1).replace(/\.0$/,'') + 'M';
  if(n >= 1000)    return (n/1000).toFixed(1).replace(/\.0$/,'') + 'K';
  return String(n);
}

async function openLeaderboard() {
  document.getElementById('leaderboard-modal').classList.add('open');

  const meCard  = document.getElementById('leaderboard-me-card');
  const podium  = document.getElementById('leaderboard-podium');
  const list    = document.getElementById('leaderboard-list');

  //  
  meCard.innerHTML = '';
  podium.innerHTML = '';
  list.innerHTML = '<div class="loading"><span class="material-symbols-outlined">autorenew</span> Loading Champions...</div>';

  try {
    const snap = await db.collection('users').orderBy('points', 'desc').limit(50).get();

    const rows = [];          // {id, data, rank}
    let myRank = -1, myPts = (currentUserData && currentUserData.points) || 0;
    let currentRank = 1;

    snap.forEach((doc) => {
      const u = doc.data();
      const isMe = currentUser && doc.id === currentUser.uid;
      if (isMe) myRank = currentRank;
      rows.push({ id: doc.id, data: u, rank: currentRank, isMe });
      currentRank++;
    });

    // ---------- 1) Your Rank Card ----------
    const myAv = (currentUserData && currentUserData.avatar)
      ? `<img src="${escapeHTML(currentUserData.avatar)}">`
      : avatarInitial((currentUserData && currentUserData.name) || 'You');
    const rankLabel = myRank > 0 ? `#${myRank}` : '50+';
    const encourage = myRank > 0
      ? 'Keep going  you are on the board! '
      : 'Post & engage to climb the ranks!';
    meCard.innerHTML = `
      <div class="lb-me-card">
        <div class="avatar" style="width:46px;height:46px;flex-shrink:0;">${myAv}</div>
        <div style="min-width:0;">
          <div style="font-size:13px;font-weight:800;color:var(--text);">Your Standing</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${encourage}</div>
        </div>
        <div class="lb-me-rank">${rankLabel}<small>RANK</small></div>
        <div class="lb-me-pts"><b>${formatLBNum(myPts)}</b><span>Points</span></div>
      </div>`;

    // ---------- 2) Top-3 Podium ----------
    if (rows.length >= 3) {
      const makePod = (r, cls, medal, crown) => {
        const u = r.data;
        const av = u.avatar
          ? `<img src="${escapeHTML(u.avatar)}">`
          : `<div>${avatarInitial(u.name)}</div>`;
        const delay = cls === 'r1' ? '.15s' : (cls === 'r2' ? '.05s' : '.25s');
        return `
          <div class="lb-pod ${cls}" onclick="closeLeaderboard(); viewUserProfile('${r.id}')" style="cursor:pointer;">
            <div class="lb-pod-av" style="animation-delay:${delay};">
              ${crown ? `<div class="lb-crown">${crown}</div>` : ''}
              ${av}
            </div>
            <div class="lb-pod-name">${escapeHTML(u.name)}${r.isMe ? ' ' : ''}</div>
            <div class="lb-pod-pts">${formatLBNum(u.points||0)} pts</div>
            <div class="lb-pod-bar" style="animation-delay:${delay};">${medal}</div>
          </div>`;
      };
      //  :     
      podium.innerHTML = `<div class="lb-podium">`
        + makePod(rows[1], 'r2', '', '')
        + makePod(rows[0], 'r1', '', '')
        + makePod(rows[2], 'r3', '', '')
        + `</div>`;
    } else {
      podium.innerHTML = ''; //       
    }

    // ---------- 3) Rest of the list (rank 4 onward) ----------
    const rest = rows.slice(3);
    if (rest.length === 0 && rows.length <= 3) {
      //     -  
      list.innerHTML = rows.length === 0
        ? '<div style="text-align:center;padding:30px;color:var(--text-muted);">No champions yet. Be the first! </div>'
        : '';
    } else {
      let html = '';
      rest.forEach((r, i) => {
        const u = r.data;
        const av = u.avatar
          ? `<img src="${escapeHTML(u.avatar)}">`
          : avatarInitial(u.name);
        html += `
          <div class="lb-row ${r.isMe ? 'is-me' : ''}" style="animation-delay:${(i*0.04).toFixed(2)}s;" onclick="closeLeaderboard(); viewUserProfile('${r.id}')">
            <div class="lb-rank">${r.rank}</div>
            <div class="avatar">${av}</div>
            <div class="lb-row-name">${escapeHTML(u.name)}${r.isMe ? ' (You)' : ''}</div>
            <div class="lb-pts-pill"><span class="material-symbols-outlined">bolt</span>${formatLBNum(u.points||0)}</div>
          </div>`;
      });
      list.innerHTML = html;
    }

  } catch (e) {
    console.error(e);
    list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--danger);">Failed to load leaderboard.</div>';
  }
}

function closeLeaderboard() {
document.getElementById('leaderboard-modal').classList.remove('open');
}

// ===== AUTH FUNCTIONS =====
async function loginWithEmail(){
    const email=document.getElementById('auth-email').value.trim();
    const pass=document.getElementById('auth-password').value;
    const msg=document.getElementById('auth-msg');
    
    if(!email||!pass){
        msg.textContent='Please enter email and password.';
        msg.className='auth-msg error';
        return;
    }
    
    msg.textContent='Your information is being checked....';
    msg.className='auth-msg success';
    
    try {
        await auth.signInWithEmailAndPassword(email, pass);
        
        //          
        document.getElementById('auth-password').value = '';
        msg.textContent = '';
        
        const successModal = document.getElementById('login-success-modal');
        if(successModal) successModal.classList.add('open');
        
        //                  
        setTimeout(() => {
            if(successModal) successModal.classList.remove('open');
        }, 3000);
        
    } catch(e) {
        msg.textContent='Login failed: '+e.message;
        msg.className='auth-msg error';
    }
}

//        ( loginWithEmail    )
function closeLoginSuccessModal() {
    const successModal = document.getElementById('login-success-modal');
    if(successModal) successModal.classList.remove('open');
}

// ---  /   ---
function togglePasswordVisibility() {
    const passwordInput = document.getElementById('auth-password');
    const eyeIcon = event.target;
    
    if (passwordInput.type === "password") {
        passwordInput.type = "text";
        eyeIcon.textContent = "visibility_off";
    } else {
        passwordInput.type = "password";
        eyeIcon.textContent = "visibility";
    }
}

// --- .    (  ) ---
function loginWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithRedirect(provider);
}

// --- .           ---
auth.getRedirectResult().then(async (result) => {
    if (result && result.user) {
        const user = result.user;
        
        // Check Blacklist
        const banCheck = await db.collection('banned_emails').doc(user.email).get();
        if (banCheck.exists) {
            await auth.signOut();
            showToast("Access Denied: This account is permanently banned.");
            return;
        }

        // Create user doc if not exists
        const doc = await db.collection('users').doc(user.uid).get();
        if (!doc.exists) {
            await db.collection('users').doc(user.uid).set({
                name: user.email.split('@')[0],
                email: user.email,
                avatar: '',
                bio: '', location: '', hometown: '', relationship: '', gender: '',
                followers: [], following: [], 
                blockedUsers: [], mutedChats: [], pinnedChats: [], archivedChats: [],
                online: true,
                points: 20,
                loginStreak: 1,
                lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
        showToast("Logged in successfully!");
        
        // Show Success Modal
        const successModal = document.getElementById('login-success-modal');
        if(successModal) successModal.classList.add('open');
        
        setTimeout(() => {
            if(successModal) successModal.classList.remove('open');
        }, 3000);
    }
}).catch((error) => {
    console.error("Google Login Error: ", error);
});

async function registerWithEmail(){
const email=document.getElementById('auth-email').value.trim();
const pass=document.getElementById('auth-password').value;
const msg=document.getElementById('auth-msg');
if(!email||!pass){msg.textContent='Please enter email and password.';msg.className='auth-msg error';return;}
// Check Blacklist
const banCheck = await db.collection('banned_emails').doc(email).get();
if (banCheck.exists) {
    msg.textContent='Access Denied: This email is permanently banned.';
    msg.className='auth-msg error';
    return;
}

msg.textContent='Creating account...';msg.className='auth-msg success';
try{
const result=await auth.createUserWithEmailAndPassword(email,pass);
const user=result.user;
const defaultName=email.split('@')[0];
await db.collection('users').doc(user.uid).set({
name:defaultName,email:user.email,avatar:'',bio:'',
location:'',hometown:'',relationship:'',gender:'',
friends:[],sentRequests:[],receivedRequests:[],
blockedUsers:[],mutedChats:[],pinnedChats:[],archivedChats:[],
online:true,
points: 0,
lastSeen:firebase.firestore.FieldValue.serverTimestamp(),
createdAt:firebase.firestore.FieldValue.serverTimestamp()
});
}catch(e){msg.textContent='Registration failed: '+e.message;msg.className='auth-msg error';}
}

// ===    ===
function doLogout() {
    //       
    document.getElementById('logout-confirm-modal').classList.add('open');
}

function closeLogoutModal() {
    document.getElementById('logout-confirm-modal').classList.remove('open');
}

function confirmLogoutAction() {
    closeLogoutModal();
    closeMainMenu(); 
    showToast("Logging out securely...");
    
    if(currentUser){
    
        db.collection('users').doc(currentUser.uid).update({
            online:false,
            lastSeen:firebase.firestore.FieldValue.serverTimestamp()
        }).then(()=>{
            auth.signOut();
        }).catch(()=>{ auth.signOut(); });
    }else{
        auth.signOut();
    }
}


async function handleDeleteAccount(){
if(!confirm("Are you absolutely sure? This action is permanent and will delete ALL your data including posts, messages, and stories."))return;
showToast("Processing account deletion...");
try{
const postsSnap = await db.collection('posts').where('uid', '==', currentUser.uid).get();
const postsBatch = db.batch();
postsSnap.forEach(doc => postsBatch.delete(doc.ref));
await postsBatch.commit();

const storiesSnap = await db.collection('stories').where('uid', '==', currentUser.uid).get();
const storiesBatch = db.batch();
storiesSnap.forEach(doc => storiesBatch.delete(doc.ref));
await storiesBatch.commit();

const chatsSnap = await db.collection('chats').get();
const chatsToDelete = [];
chatsSnap.forEach(doc => {
if(doc.id.includes(currentUser.uid)) {
chatsToDelete.push(doc.id);
}
});
for(let chatId of chatsToDelete) {
const messagesSnap = await db.collection('chats').doc(chatId).collection('messages').get();
const msgBatch = db.batch();
messagesSnap.forEach(doc => msgBatch.delete(doc.ref));
await msgBatch.commit();
await db.collection('chats').doc(chatId).delete();
}

const notifsSnap = await db.collection('notifications').where('toUid', '==', currentUser.uid).get();
const notifsBatch = db.batch();
notifsSnap.forEach(doc => notifsBatch.delete(doc.ref));
await notifsBatch.commit();

await db.collection('users').doc(currentUser.uid).delete();
await auth.currentUser.delete();

showToast("Account deleted successfully!");
setTimeout(()=>window.location.reload(),1500);
}catch(e){
console.error("Delete error:", e);
showToast("Failed to delete account. Please try again.");
}
}

function updateOnlineStatus(){
    if(currentUser){
        //   ON    
        if (currentUserData.showActiveStatus !== false) {
            db.collection('users').doc(currentUser.uid).update({
                online: true,
                lastSeen: firebase.firestore.FieldValue.serverTimestamp()
            }).catch(()=>{});
        } else {
            // OFF     (    )
            db.collection('users').doc(currentUser.uid).update({
                online: false,
                lastSeen: firebase.firestore.FieldValue.serverTimestamp()
            }).catch(()=>{});
        }
    }
}

// ===== ADMIN REMOTE CONTROL RECEIVERS =====
db.collection('system').doc('settings').onSnapshot(doc => {
    if (doc.exists && doc.data().maintenanceMode === true) {
        if (!document.getElementById('maintenance-overlay')) {
            const overlay = document.createElement('div');
            overlay.id = 'maintenance-overlay';
            overlay.style = 'position:fixed; top:0; left:0; width:100%; height:100%; background:#f4f7f6; z-index:99999; display:flex; justify-content:center; align-items:center; flex-direction:column;';
            overlay.innerHTML = '<h2 style="color:#333;"> App Under Maintenance</h2><p>We are updating GoChat. Please wait!</p>';
            document.body.appendChild(overlay);
        }
    } else {
        const overlay = document.getElementById('maintenance-overlay');
        if (overlay) overlay.remove();
    }
});

db.collection('system').doc('announcement').onSnapshot(doc => {
    if (doc.exists && doc.data().message) {
        alert(" GoChat Notice:\n\n" + doc.data().message);
    }
});
// ==========================================



// ===== AUTH STATE LISTENER =====
auth.onAuthStateChanged(async(user)=>{

//      
const removeSplash = () => {
    const splash = document.getElementById('splash-screen');
    if (splash && splash.style.display !== 'none') { 
        splash.style.opacity = '0'; 
        setTimeout(() => splash.style.display = 'none', 500); 
    }
};

if(user){
currentUser=user;
// Median OneSignal-     
if (navigator.userAgent.toLowerCase().includes('median')) {
    if (window.median && window.median.onesignal) {
        window.median.onesignal.login({ externalId: user.uid });
    }
}

//           ,      
document.getElementById('auth-screen').style.display='none';
document.getElementById('app-screen').style.display='block';

//   .   ,        
const splashFallbackTimer = setTimeout(removeSplash, 1500);

try{
const snap=await db.collection('users').doc(user.uid).get();
currentUserData=snap.exists?snap.data():{name:user.email.split('@')[0],email:user.email};
}catch(e){currentUserData={name:user.email.split('@')[0],email:user.email};}

//             
clearTimeout(splashFallbackTimer);
removeSplash();
cleanupPrivateChatsOnLoad(); 


setTimeout(() => { isAppReadyForNotifs = true; }, 3000); 

await updateOnlineStatus();
if(onlineStatusInterval)clearInterval(onlineStatusInterval);
onlineStatusInterval=setInterval(updateOnlineStatus,60000);

// ---  -    (Ghost User Filter) ---
setInterval(async () => {
    if (!currentUser) return;
    try {
        const snap = await db.collection('users').where('online', '==', true).get();
        const onlineUids = [];
        const now = Date.now();
        
        snap.forEach(d => {
            const data = d.data();
            // .         
            if (data.showActiveStatus !== false) {
                // .   :        ?
                const lastSeenTime = data.lastSeen?.toMillis ? data.lastSeen.toMillis() : now;
                const timeDiff = now - lastSeenTime;
                
                                if (timeDiff < 180000) { // 180000 ms = 3 
                    onlineUids.push(d.id);
                } else {
                    //     ,        (Ghost)
                    d.ref.update({ online: false }).catch(()=>{});
                }
            }
        });
        
        //  NEW LOGIC:    ,     !
        if (currentUserData && currentUserData.showActiveStatus === false) {
            onlineUids.length = 0; 
        }

        if (allUsersCache) {
            allUsersCache.forEach(u => { u.online = onlineUids.includes(u.id); });
        }

        //   -  
        if (currentChatId && currentChatOtherUid && currentChatOtherUid !== 'group') {
            const chatAvEl = document.getElementById('chat-avatar');
            if (chatAvEl) {
                let dot = chatAvEl.querySelector('.online-dot');
                if (onlineUids.includes(currentChatOtherUid)) {
                    if (!dot) chatAvEl.insertAdjacentHTML('beforeend', '<div class="online-dot"></div>');
                } else {
                    if (dot) dot.remove();
                }
            }
        }

        //    
        document.querySelectorAll('.msg-item').forEach(item => {
            const uid = item.getAttribute('data-other-uid');
            if (uid && uid !== 'group') {
                const avatarDiv = item.querySelector('.avatar');
                if (avatarDiv) {
                    let dot = avatarDiv.querySelector('.online-dot');
                    if (onlineUids.includes(uid)) {
                        if (!dot) avatarDiv.insertAdjacentHTML('beforeend', '<div class="online-dot"></div>');
                    } else {
                        if (dot) dot.remove();
                    }
                }
            }
        });
    } catch (e) {}
}, 30000);

        //  NEW: Deep Linking Profile Routing (      )
        const urlParams = new URLSearchParams(window.location.search);
        const profileUidToOpen = urlParams.get('user');

        if (profileUidToOpen && profileUidToOpen.length > 5) {
            //     ,        
            setTimeout(() => {
                viewUserProfile(profileUidToOpen);
                
                //        ?user=...     
                const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
                window.history.replaceState({path:newUrl}, '', newUrl);
            }, 1000); //         
        }

//     (      )
function handleAppVisibility() {
    if (!currentUser) return;
    if (document.visibilityState === 'visible') {
        updateOnlineStatus(); //        
    } else {
        //          
        db.collection('users').doc(currentUser.uid).update({
            online: false,
            lastSeen: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(()=>{});
    }
}
document.addEventListener("visibilitychange", handleAppVisibility);
window.addEventListener("pagehide", handleAppVisibility);

window.addEventListener('beforeunload',()=>{
    if(currentUser){
        db.collection('users').doc(currentUser.uid).update({
            online: false,
            lastSeen: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(()=>{});
    }
});

loadUserUI(); loadFeed(); loadMessages(); loadStories(); cleanupExpiredPosts(); fixMissingNamesInChats();

db.collection('users').doc(user.uid).onSnapshot(doc=>{
if(doc.exists){
currentUserData=doc.data();
// --- LOCKDOWN CHECK ---
if (currentUserData.isBanned) {
    document.body.innerHTML = `
        <div style="height:100vh; display:flex; flex-direction:column; justify-content:center; align-items:center; background:#1a1a2e; color:white; font-family:sans-serif; text-align:center; padding: 20px;">
            <span class="material-symbols-outlined" style="font-size: 80px; color: #ff4d6a; margin-bottom: 20px;">gavel</span>
            <h1 style="color:#ff4d6a; margin-bottom:10px;">ACCOUNT BANNED</h1>
            <p style="color:#a0a0b5; margin-bottom:30px;">Your account has been permanently suspended by the Admin.</p>
            <button onclick="firebase.auth().signOut().then(()=>window.location.reload())" style="padding:12px 24px; background:#ff4d6a; color:white; border:none; border-radius:30px; font-weight:bold; cursor:pointer;">Exit App</button>
        </div>
    `;
    auth.signOut();
    return;
}
// -----------------------

loadUserUI();loadFriendRequests();
const fBadge=document.getElementById('friends-badge');
const reqCount=currentUserData.receivedRequests?currentUserData.receivedRequests.length:0;
if(fBadge){
if(reqCount>0){fBadge.textContent=reqCount;fBadge.style.display='flex';}
else{fBadge.style.display='none';}
}
}
});
notifUnsub = db.collection('notifications').where('toUid', '==', user.uid).onSnapshot(async nSnap => {
    if (!allUsersCache) await fetchAllUsers();
    
    let notifs = [];
    nSnap.forEach(doc => {
        notifs.push({ id: doc.id, ...doc.data() });
    });

    //    (   )
    notifs.sort((a, b) => {
        const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
        const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
        return tb - ta;
    });

    const unreadNotif = notifs.filter(nd => nd.read === false).length;
    const nBadge = document.getElementById('notif-badge');
    if (nBadge) {
        if (unreadNotif > 0) {
            nBadge.textContent = unreadNotif;
            nBadge.style.display = 'flex';
        } else {
            nBadge.style.display = 'none';
        }
    }

    const nList = document.getElementById('notifications-list');
    if (!nList) return;
    
    if (notifs.length === 0) {
        nList.innerHTML = '<div class="empty-feed">No notifications yet</div>';
        return;
    }

    nList.innerHTML = notifs.map(data => {
        let textDesc = 'interacted with you';
        if (data.type === 'like') textDesc = 'liked your post';
        else if (data.type === 'comment') textDesc = 'commented on your post';
        else if (data.type === 'follow') textDesc = 'started following you';
        else if (data.type === 'tag') textDesc = 'tagged you in a post';
        
        const safeName = escapeHTML(data.fromName || 'Someone');
        
        //    
        let onClickAction = `db.collection('notifications').doc('${data.id}').update({read:true});`;
        if (data.postId) {
            onClickAction += ` openSinglePostView('${data.postId}');`;
        } else if (data.type === 'friend_request' || data.type === 'request_accepted') {
            onClickAction += ` showPage('friends');`;
        }

        const isChecked = typeof selectedNotifs !== 'undefined' && selectedNotifs.includes(data.id);
        const displayCb = typeof isNotifEditMode !== 'undefined' && isNotifEditMode ? 'block' : 'none';

        let userAvatarHtml = avatarInitial(data.fromName || 'U');
        if (allUsersCache) {
            const senderData = allUsersCache.find(u => u.id === data.fromUid);
            if (senderData && senderData.avatar) {
                userAvatarHtml = `<img src="${escapeHTML(senderData.avatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
            }
        }

        return `
        <div class="notif-item ${!data.read ? 'unread' : ''}" onclick="if(typeof isNotifEditMode !== 'undefined' && isNotifEditMode){toggleNotifSelection('${data.id}');}else{${onClickAction}}">
            <div class="avatar sm">${userAvatarHtml}</div>
            <div class="fb-notif-content" style="flex:1;">
                <strong>${safeName}</strong> ${textDesc}
                <div class="fb-notif-time">${getRelativeTime(data.createdAt)}</div>
            </div>
            <input type="checkbox" class="notif-checkbox" id="notif-cb-${data.id}" ${isChecked ? 'checked' : ''} style="display:${displayCb}; pointer-events:none; width:22px; height:22px; accent-color:var(--danger);">
        </div>`;
    }).join('');
});
}else{
currentUser=null;currentUserData=null;
document.getElementById('auth-screen').style.display='flex';
document.getElementById('app-screen').style.display='none';
//         
removeSplash();

if(feedUnsub)feedUnsub();
if(notifUnsub)notifUnsub();
if(storyUnsub)storyUnsub();
if(onlineStatusInterval)clearInterval(onlineStatusInterval);
}
});
//        
function openMainMenu() {
    document.getElementById('main-menu-screen').style.display = 'flex';
    //          
    if (typeof updatePrivateAccountUI === 'function') updatePrivateAccountUI();
    if (typeof updateActiveStatusUI === 'function') updateActiveStatusUI();
    if (typeof updateMessageSoundUI === 'function') updateMessageSoundUI();
    if (typeof updateDarkModeUI === 'function') updateDarkModeUI(); //   
}

function closeMainMenu() {
    document.getElementById('main-menu-screen').style.display = 'none';
}

// === Elite GoChat Placeholder Function ===
function openEliteGoChat() {
    //        
    //           
    showToast('Elite GoChat features are coming soon!');
}

//        
function openMainSettingsScreen() {
    document.getElementById('main-settings-screen').style.display = 'flex';
    
    //      (On/Off)   
    if (typeof updatePrivateAccountUI === 'function') updatePrivateAccountUI();
    if (typeof updateActiveStatusUI === 'function') updateActiveStatusUI();
    if (typeof updateMessageSoundUI === 'function') updateMessageSoundUI();
    if (typeof updateDarkModeUI === 'function') updateDarkModeUI();
    if (typeof updateGridToggleUI === 'function') updateGridToggleUI();
}

function closeMainSettingsScreen() {
    document.getElementById('main-settings-screen').style.display = 'none';
}

// ===== NAVIGATION =====
function showPage(page) {
    //    
    if (page === 'feed' && document.getElementById('page-feed').classList.contains('active')) {
        refreshFeed(); 
        window.scrollTo({top: 0, behavior: 'smooth'}); 
        return; 
    }

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    const pEl = document.getElementById('page-' + page);
    if(pEl) pEl.classList.add('active');
    
    const nEl = document.getElementById('nav-' + page);
    if(nEl) nEl.classList.add('active');

    //  Topbar Dynamic Logic (   /  )
    const topbarLogo = document.querySelector('.topbar-logo');
    document.body.classList.remove('messages-mode', 'notifications-mode'); //   

    if (page === 'messages') {
        document.body.classList.add('messages-mode');
        if(topbarLogo) topbarLogo.textContent = 'Chats';
    } else if (page === 'notifications') {
        document.body.classList.add('notifications-mode'); //   
        if(topbarLogo) topbarLogo.textContent = 'Notifications'; //   
    } else {
        if(topbarLogo) topbarLogo.textContent = ' GoChat'; //      
    }

    //     
    const settingsIcon = document.getElementById('topbar-settings-btn');
    if (page === 'profile') {
        settingsIcon.style.display = 'flex'; 
    } else {
        settingsIcon.style.display = 'none'; 
    }

    if(page === 'messages') loadMessages();
    if(page === 'profile') { loadUserUI(); loadMyPosts(); }
    if(page === 'friends') { loadFriendRequests(); loadAllFriends(); }
    
    window.scrollTo({top: 0, behavior: 'smooth'});
}

function refreshFeed(){
showToast('Refreshing...');
loadFeed();loadStories();
}

async function deleteNotification(id){
await db.collection('notifications').doc(id).delete();
showToast('Notification deleted');
}

function toggleArchivedChats(){
const section=document.getElementById('archived-chats');
section.classList.toggle('show');
if(section.classList.contains('show'))loadArchivedMessages();
}

// ===== FRIEND SYSTEM =====
async function sendRequest(uid){
if(!checkRateLimit()) return;
await db.collection('users').doc(uid).update({
receivedRequests:firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
});
await db.collection('users').doc(currentUser.uid).update({
sentRequests:firebase.firestore.FieldValue.arrayUnion(uid)
});
db.collection('notifications').add({
toUid:uid,fromUid:currentUser.uid,
fromName:currentUserData.name,
type:'friend_request',read:false,
createdAt:firebase.firestore.FieldValue.serverTimestamp()
});
searchUsers();
showToast('Request sent');
}

async function cancelRequest(uid){
if(!checkRateLimit()) return;
await db.collection('users').doc(uid).update({
receivedRequests:firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
});
await db.collection('users').doc(currentUser.uid).update({
sentRequests:firebase.firestore.FieldValue.arrayRemove(uid)
});
searchUsers();
showToast('Request cancelled');
}

async function acceptRequest(uid){
if(!checkRateLimit()) return;
await db.collection('users').doc(currentUser.uid).update({
receivedRequests:firebase.firestore.FieldValue.arrayRemove(uid),
friends:firebase.firestore.FieldValue.arrayUnion(uid)
});
await db.collection('users').doc(uid).update({
sentRequests:firebase.firestore.FieldValue.arrayRemove(currentUser.uid),
friends:firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
});
db.collection('notifications').add({
toUid:uid,fromUid:currentUser.uid,
fromName:currentUserData.name,
type:'request_accepted',read:false,
createdAt:firebase.firestore.FieldValue.serverTimestamp()
});
awardPoints(currentUser.uid, 15);
awardPoints(uid, 15);
searchUsers();loadFriendRequests();
showToast('Request accepted!');
}

async function rejectRequest(uid){
if(!checkRateLimit()) return;
await db.collection('users').doc(currentUser.uid).update({
receivedRequests:firebase.firestore.FieldValue.arrayRemove(uid)
});
await db.collection('users').doc(uid).update({
sentRequests:firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
});
loadFriendRequests();
showToast('Request removed');
}

async function confirmUnfriend(uid){
if(!confirm("Are you sure you want to unfriend this user?"))return;
await db.collection('users').doc(currentUser.uid).update({
friends:firebase.firestore.FieldValue.arrayRemove(uid)
});
await db.collection('users').doc(uid).update({
friends:firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
});
showToast("Unfriended");
closeUserProfile();
}

function switchFriendsTab(tab) {
const requestsSection = document.getElementById('requests-section');
const myFriendsSection = document.getElementById('my-friends-section');
const btnRequests = document.getElementById('tab-requests');
const btnMyFriends = document.getElementById('tab-my-friends');
if (tab === 'requests') {
requestsSection.style.display = 'block';
myFriendsSection.style.display = 'none';
btnRequests.classList.add('active');
btnMyFriends.classList.remove('active');
loadFriendRequests();
} else {
requestsSection.style.display = 'none';
myFriendsSection.style.display = 'block';
btnRequests.classList.remove('active');
btnMyFriends.classList.add('active');
loadAllFriends();
}
}

function toggleFriendsEditMode() {
isFriendsEditMode = !isFriendsEditMode;
const btn = document.getElementById('edit-friends-btn');
const deleteBtn = document.getElementById('delete-friends-btn');
if (isFriendsEditMode) {
btn.textContent = 'Cancel';
btn.style.background = 'var(--surface-2)';
deleteBtn.style.display = 'block';
} else {
btn.textContent = 'Edit';
btn.style.background = 'transparent';
deleteBtn.style.display = 'none';
friendsToDelete = [];
}
loadAllFriends();
}

async function loadAllFriends() {
    const list = document.getElementById('all-friends-list');
    if (!list) return;
    
    list.innerHTML = '<div class="loading"><span class="material-symbols-outlined">autorenew</span> Loading...</div>';
    
    //       
    const following = currentUserData.following || [];
    
    if (following.length === 0) {
        list.innerHTML = '<div class="empty-feed">You are not following anyone yet</div>';
        return;
    }

    try {
        const userDocs = following.map(uid => db.collection('users').doc(uid).get());
        const snapshots = await Promise.all(userDocs);
        
        let html = '';
        snapshots.forEach((doc, index) => {
            if (doc.exists) {
                const u = doc.data();
                const safeName = escapeHTML(u.name);
                const avHtml = u.avatar ? `<img src="${u.avatar}">` : avatarInitial(u.name);
                
                //      
                html += `
                <div class="friend-item-check" style="justify-content: space-between;">
                    <div style="display:flex; align-items:center; gap:12px;" onclick="viewUserProfile('${following[index]}')">
                        <div class="avatar">${avHtml}</div>
                        <div class="msg-name">${safeName}</div>
                    </div>
                    <button class="btn-outline" style="padding:6px 12px; font-size:11px;" onclick="toggleFollow('${following[index]}')">Unfollow</button>
                </div>`;
            }
        });
        list.innerHTML = html;
    } catch (e) {
        list.innerHTML = '<div class="empty-feed">Failed to load following list</div>';
    }
}


function handleFriendSelection(checkbox) {
const uid = checkbox.value;
if (checkbox.checked) {
if (!friendsToDelete.includes(uid)) {
friendsToDelete.push(uid);
}
} else {
friendsToDelete = friendsToDelete.filter(id => id !== uid);
}
const deleteBtn = document.getElementById('delete-friends-btn');
if (friendsToDelete.length > 0) {
deleteBtn.style.opacity = '1';
deleteBtn.textContent = `Delete (${friendsToDelete.length})`;
} else {
deleteBtn.style.opacity = '0.5';
deleteBtn.textContent = 'Delete Selected';
}
}

async function deleteSelectedFriends() {
if (friendsToDelete.length === 0) return;
if (!confirm(`Are you sure you want to remove ${friendsToDelete.length} friends?`)) return;
showToast("Removing friends...");
const removePromises = friendsToDelete.map(uid =>
db.collection('users').doc(currentUser.uid).update({
friends: firebase.firestore.FieldValue.arrayRemove(uid)
})
);
const otherPromises = friendsToDelete.map(uid =>
db.collection('users').doc(uid).update({
friends: firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
})
);
try {
await Promise.all([...removePromises, ...otherPromises]);
friendsToDelete = [];
showToast("Friends removed successfully");
toggleFriendsEditMode();
loadAllFriends();
} catch (e) {
showToast("Failed to remove some friends");
}
}

async function loadFriendRequests(){
const list=document.getElementById('friend-requests-list');
if(!list)return;
const reqs=currentUserData.receivedRequests||[];
if(reqs.length===0){list.innerHTML='<div class="empty-feed">No requests yet</div>';return;}
try {
const reqDocs = reqs.map(uid => db.collection('users').doc(uid).get());
const snapshots = await Promise.all(reqDocs);
let html='';
snapshots.forEach((doc, index) => {
if(doc.exists){
const u=doc.data();
const safeName=escapeHTML(u.name);
const avHtml=u.avatar?`<img src="${u.avatar}">`:avatarInitial(u.name);
html+=`<div class="friend-req-item">
<div class="avatar" onclick="viewUserProfile('${reqs[index]}')">${avHtml}</div>
<div class="msg-info" onclick="viewUserProfile('${reqs[index]}')">
<div class="msg-name">${safeName}</div>
</div>
<div class="friend-req-actions">
<button class="accept-btn" onclick="acceptRequest('${reqs[index]}')">Accept</button>
<button class="reject-btn" onclick="rejectRequest('${reqs[index]}')">Delete</button>
</div>
</div>`;
}
});
list.innerHTML=html;
} catch (e) {
list.innerHTML = '<div class="empty-feed">Failed to load requests</div>';
}
}

// ===== NEW FOLLOW SYSTEM LOGIC =====
async function toggleFollow(targetUid) {
    if(!checkRateLimit()) return;
    
    //        
    const isFollowing = currentUserData.following?.includes(targetUid);
    
    if (isFollowing) {
        //  (Unfollow)  
        await db.collection('users').doc(currentUser.uid).update({
            following: firebase.firestore.FieldValue.arrayRemove(targetUid)
        });
        await db.collection('users').doc(targetUid).update({
            followers: firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
        });
        showToast('Unfollowed');
    } else {
        //  (Follow)  
        await db.collection('users').doc(currentUser.uid).update({
            following: firebase.firestore.FieldValue.arrayUnion(targetUid)
        });
        await db.collection('users').doc(targetUid).update({
            followers: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
        });
        showToast('Following!');
        
        //    
        db.collection('notifications').add({
            toUid: targetUid,
            fromUid: currentUser.uid,
            fromName: currentUserData.name,
            type: 'follow',
            read: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
    
    //       
    if(document.getElementById('page-other-profile').classList.contains('active') || document.getElementById('page-other-profile').classList.contains('open')) {
        viewUserProfile(targetUid);
    }
    searchUsers();
}

// ===== UPDATE SEARCH SYSTEM =====
async function searchUsers() {
    const input = document.getElementById('search-input');
    const q = input.value.trim().toLowerCase();
    const res = document.getElementById('search-results-list');

    // . :        (   )
    if (q.length < 3) {
        if (q.length === 0) renderRecentSearches(); //    
        else res.innerHTML = '<div class="empty-feed">Type at least 3 characters...</div>';
        return;
    }

    // .  (Debouncing):       -  
    clearTimeout(searchTimeout);
    res.innerHTML = '<div class="loading"><span class="material-symbols-outlined">autorenew</span> Searching...</div>';

    searchTimeout = setTimeout(async () => {
        const users = await fetchAllUsers();
        let html = '';
        
        //   
        const filteredUsers = users.filter(u => 
            u.id !== currentUser.uid && 
            u.name && 
            u.name.toLowerCase().includes(q)
        );

        if (filteredUsers.length === 0) {
            res.innerHTML = '<div class="empty-feed">No users found</div>';
            return;
        }

        filteredUsers.forEach(u => {
            const isFollowing = currentUserData.following?.includes(u.id);
            const btnHtml = isFollowing ? 
                `<button class="btn-outline" style="padding:6px 14px;font-size:11px;" onclick="event.stopPropagation(); toggleFollow('${u.id}')">Following</button>` : 
                `<button class="btn-primary" style="padding:6px 14px;font-size:11px;margin:0;" onclick="event.stopPropagation(); toggleFollow('${u.id}')">Follow</button>`;
            
            const avHtml = u.avatar ? `<img src="${u.avatar}">` : avatarInitial(u.name);
            
            html += `
            <div class="msg-item" onclick="addToRecentSearches('${u.id}'); viewUserProfile('${u.id}')">
                <div class="avatar">${avHtml}</div>
                <div class="msg-info" style="margin-left:10px;">
                    <div class="msg-name">${escapeHTML(u.name)} ${getVerifiedBadge(u.email, u.isVerified)}</div>
                </div>
                <div>${btnHtml}</div>
            </div>`;
        });
        res.innerHTML = html;
    }, 500); //  -  
}

// ===== RECENT SEARCH LOGIC =====
async function renderRecentSearches() {
    const res = document.getElementById('search-results-list');
    const recents = currentUserData.recentSearches || [];
    
    if(recents.length === 0) {
        res.innerHTML = '<div class="empty-feed">Type a name to search users</div>';
        return;
    }
    
    res.innerHTML = '<div class="loading"><span class="material-symbols-outlined">autorenew</span> Loading...</div>';
    
    try {
        const users = await fetchAllUsers(); 
        let html = '<div style="padding: 12px 16px; font-size: 13px; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">Recent Searches</div>';
        
        recents.forEach(uid => {
            const u = users.find(user => user.id === uid);
            if(u) {
                const safeName = escapeHTML(u.name);
                const avHtml = u.avatar ? `<img src="${u.avatar}">` : avatarInitial(u.name);
                //     (  )
                html += `<div class="msg-item" onclick="viewUserProfile('${uid}')">
                    <div class="avatar">${avHtml}</div>
                    <div class="msg-info" style="margin-left:10px;">
                        <div class="msg-name">${safeName} ${getVerifiedBadge(u.email, u.isVerified)}</div>
                    </div>
                    <span class="material-symbols-outlined" style="color:var(--text-muted); font-size: 20px; padding: 4px; cursor:pointer;" onclick="event.stopPropagation(); removeRecentSearch('${uid}')">close</span>
                </div>`;
            }
        });
        res.innerHTML = html;
    } catch(e) {
        res.innerHTML = '<div class="empty-feed">Type a name to search users</div>';
    }
}

async function addToRecentSearches(uid) {
    if(!currentUser) return;
    let recents = currentUserData.recentSearches || [];
    
    //     ,       
    recents = recents.filter(id => id !== uid);
    recents.unshift(uid); 
    
    //    
    if(recents.length > 3) {
        recents = recents.slice(0, 3);
    }
    
    currentUserData.recentSearches = recents;
    
    //   
    db.collection('users').doc(currentUser.uid).update({
        recentSearches: recents
    }).catch(e => console.log(e));
}

async function removeRecentSearch(uid) {
    let recents = currentUserData.recentSearches || [];
    recents = recents.filter(id => id !== uid);
    currentUserData.recentSearches = recents;
    
    renderRecentSearches(); //   UI  
    
    db.collection('users').doc(currentUser.uid).update({
        recentSearches: recents
    }).catch(e => console.log(e));
}


async function openFriendsListModal(uid){
document.getElementById('friends-list-modal').classList.add('open');
const container=document.getElementById('friends-list-container');
container.innerHTML='<div class="loading"><span class="material-symbols-outlined">autorenew</span> Loading...</div>';
const doc=await db.collection('users').doc(uid).get();
if(!doc.exists)return;
const friends=doc.data().friends||[];
if(friends.length===0){container.innerHTML='<div class="empty-feed">No friends yet</div>';return;}
try {
const friendDocs = friends.map(fId => db.collection('users').doc(fId).get());
const snapshots = await Promise.all(friendDocs);
let html='';
snapshots.forEach((fDoc, index) => {
if(fDoc.exists){
const u=fDoc.data();
const safeName=escapeHTML(u.name);
const avHtml=u.avatar?`<img src="${u.avatar}">`:avatarInitial(u.name);
html+=`<div class="msg-item" onclick="closeFriendsListModal();viewUserProfile('${friends[index]}')">
<div class="avatar">${avHtml}</div>
<div class="msg-info" style="margin-left:10px;">${safeName}</div>
</div>`;
}
});
container.innerHTML=html;
} catch (e) {
container.innerHTML = '<div class="empty-feed">Failed to load friends</div>';
}
}

function closeFriendsListModal(){
document.getElementById('friends-list-modal').classList.remove('open');
}

// ===== STORY LOGIC =====
async function uploadStory(input){
const file=input.files[0];
if(!file)return;
const isVideo=file.type.startsWith('video/');
showToast('Uploading Story...');
try{
const url=await uploadToCloudinary(file,isVideo);
await db.collection('stories').add({
uid:currentUser.uid,
name:currentUserData.name,
avatar:currentUserData.avatar||'',
mediaUrl:url,
isVideo:isVideo,
views:[],reacts:[],
createdAt:firebase.firestore.FieldValue.serverTimestamp(),
expiresAt:new Date(Date.now()+ONE_DAY_MS)
});
showToast('Story added!');
awardPoints(currentUser.uid, 25);
input.value='';
}catch(e){showToast('Network error.');}
}

function loadStories(){
    const list=document.getElementById('stories-list');
    if(!list)return;
    if(storyUnsub)storyUnsub();
    storyUnsub=db.collection('stories').onSnapshot(snap=>{
        let stories=[];
        snap.forEach(d=>stories.push({id:d.id,...d.data()}));
        let grouped={};
        stories.forEach(s=>{
            if(!grouped[s.uid])grouped[s.uid]=[];
            grouped[s.uid].push(s);
        });
        
        let html='';
        let userIdsOrder = []; //    
        
        // .     
        if(grouped[currentUser.uid]){
            const av=currentUserData.avatar||'https://via.placeholder.com/150/7c5cff/FFFFFF?text='+avatarInitial(currentUserData.name);
            html+=`<div>
            <div class="story-circle" onclick="playStories('${currentUser.uid}')">
            <img src="${av}">
            </div>
            <div class="story-name">Your Story</div>
            </div>`;
            userIdsOrder.push(currentUser.uid);
            delete grouped[currentUser.uid];
        }
        
        // .   'seen'  'unseen'   
        let unseenUsers = [];
        let seenUsers = [];
        
        for(let uid in grouped){
            //           
            const allSeen = grouped[uid].every(s => s.views && s.views.includes(currentUser.uid));
            
            if(allSeen) {
                seenUsers.push(uid); //    seen 
            } else {
                unseenUsers.push(uid); //    unseen 
            }
        }
        
        // .  unseen ( )    (  )
        unseenUsers.forEach(uid => {
            const uName=grouped[uid][0].name;
            const safeUName=escapeHTML(uName);
            const uAv=grouped[uid][0].avatar||'https://via.placeholder.com/150/7c5cff/FFFFFF?text='+avatarInitial(uName);
            html+=`<div>
            <div class="story-circle" onclick="playStories('${uid}')">
            <img src="${uAv}">
            </div>
            <div class="story-name">${safeUName}</div>
            </div>`;
            userIdsOrder.push(uid);
        });

        // .  seen ()    (  ,  )
        seenUsers.forEach(uid => {
            const uName=grouped[uid][0].name;
            const safeUName=escapeHTML(uName);
            const uAv=grouped[uid][0].avatar||'https://via.placeholder.com/150/7c5cff/FFFFFF?text='+avatarInitial(uName);
            // .seen          
            html+=`<div>
            <div class="story-circle seen" onclick="playStories('${uid}')">
            <img src="${uAv}">
            </div>
            <div class="story-name" style="color:var(--text-muted);">${safeUName}</div>
            </div>`;
            userIdsOrder.push(uid);
        });
        
        list.innerHTML=html;
        window.allStoriesData=stories;
        window.storyUserIds = userIdsOrder;
    });
}

function playStories(uid, startIndex = 0){
    if(!window.allStoriesData)return;
    
    //        
    window.currentStoryUidIndex = window.storyUserIds.indexOf(uid); 
    
    activeStoryGroup=window.allStoriesData.filter(s=>s.uid===uid).sort((a,b)=>{
        const ta=a.createdAt?.toMillis?a.createdAt.toMillis():0;
        const tb=b.createdAt?.toMillis?b.createdAt.toMillis():0;
        return ta-tb;
    });
    
    if(activeStoryGroup.length===0)return;
    currentStoryIndex = startIndex; //    
    document.getElementById('story-viewer').classList.add('open');
    renderCurrentStory();
}


function renderCurrentStory(){
    if(currentStoryIndex>=activeStoryGroup.length){closeStory();return;}
    const s=activeStoryGroup[currentStoryIndex];
    const safeName=escapeHTML(s.name);
    //      
const sVerified = s.isVerified || false; 
document.getElementById('sv-name').innerHTML = safeName + getVerifiedBadge(s.email, sVerified);
    
    // . -    
    const svMenuBtn = document.getElementById('sv-menu-btn');
    if(svMenuBtn) {
        svMenuBtn.style.display = 'block'; 
    }

    // .       ,      (CSS Conflict Fix)
    const svDeleteBtn = document.getElementById('sv-delete-btn');
    if(svDeleteBtn) {
        if (s.uid === currentUser.uid) {
            svDeleteBtn.style.setProperty('display', 'flex', 'important');
        } else {
            svDeleteBtn.style.setProperty('display', 'none', 'important'); //    
        }
    }

    const sm = document.getElementById('story-menu');
    if(sm) sm.classList.remove('open');
    document.getElementById('sv-avatar').innerHTML=s.avatar?`<img src="${s.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`:avatarInitial(s.name);
    
    //     
    document.getElementById('sv-views').textContent=(s.views||[]).length;
    const reactCountDisplay = document.getElementById('sv-react-count');
    if(reactCountDisplay) {
        reactCountDisplay.textContent=(s.reacts||[]).length;
    }

    const reactBtn=document.getElementById('sv-react-btn');
    if(s.reacts&&s.reacts.includes(currentUser.uid)){
        reactBtn.style.color='var(--danger)';
        reactBtn.className='ph-fill ph-heart';
    }else{
        reactBtn.style.color='#fff';
        reactBtn.className='ph-bold ph-heart';
    }

    const mediaCont = document.getElementById('sv-media-container');
    
    //      
    if (s.isText) {
        const safeText = escapeHTML(s.text).replace(/\n/g, '<br>');
        mediaCont.innerHTML = `
        <div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:${s.bgColor || '#1a1a2e'}; padding: 20px; text-align:center;">
            <div style="font-size:26px; font-weight:800; color:#fff; word-break:break-word; text-shadow:0 2px 10px rgba(0,0,0,0.2); line-height: 1.4;">${safeText}</div>
        </div>`;
        clearTimeout(storyTimer);
        storyTimer = setTimeout(nextStorySegment, 5000);
    } 
    //     
    else if(s.isVideo) {
        mediaCont.innerHTML=`<video src="${s.mediaUrl}" autoplay playsinline onended="nextStorySegment()" style="width:100%;max-height:85vh;object-fit:contain;"></video>`;
        clearTimeout(storyTimer);
    } else {
        mediaCont.innerHTML=`<img src="${s.mediaUrl}">`;
        clearTimeout(storyTimer);
        storyTimer=setTimeout(nextStorySegment,5000);
    }

    document.getElementById('story-progress-bar').innerHTML=activeStoryGroup.map((_,i)=>`<div class="story-progress-segment"><div class="story-progress-fill ${i===currentStoryIndex?'animating':''}" style="width:${i<currentStoryIndex?'100%':'0%'};"></div></div>`).join('');
    
    if(s.uid!==currentUser.uid&&!(s.views||[]).includes(currentUser.uid)){
        db.collection('stories').doc(s.id).update({
            views:firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
        });
    }
}
//    
function nextStorySegment(){
    if(currentStoryIndex < activeStoryGroup.length - 1) {
        //    
        currentStoryIndex++;
        renderCurrentStory();
    } else {
        //    ,    
        if(window.storyUserIds && window.currentStoryUidIndex < window.storyUserIds.length - 1) {
            window.currentStoryUidIndex++;
            let nextUid = window.storyUserIds[window.currentStoryUidIndex];
            playStories(nextUid, 0); 
        } else {
            closeStory(); //       
        }
    }
}

//    
function prevStorySegment(){
    if(currentStoryIndex > 0) {
        //    
        currentStoryIndex--;
        renderCurrentStory();
    } else {
        //     
        if(window.storyUserIds && window.currentStoryUidIndex > 0) {
            window.currentStoryUidIndex--;
            let prevUid = window.storyUserIds[window.currentStoryUidIndex];
            let prevGroup = window.allStoriesData.filter(s=>s.uid===prevUid);
            playStories(prevUid, prevGroup.length - 1);
        } else {
            //           
            currentStoryIndex = 0;
            renderCurrentStory();
        }
    }
}


function closeStory(){
document.getElementById('story-viewer').classList.remove('open');
clearTimeout(storyTimer);
document.getElementById('sv-media-container').innerHTML='';
}

//     
function viewProfileFromStory() {
    if (!activeStoryGroup || currentStoryIndex >= activeStoryGroup.length) return;
    const uid = activeStoryGroup[currentStoryIndex].uid;
    
    // .   -   
    closeStory();
    
    // .     ,      
    if (uid === currentUser.uid) {
        showPage('profile');
    } else {
        const profilePage = document.getElementById('page-other-profile');
        if (profilePage) {
            profilePage.classList.add('open');
            viewUserProfile(uid);
        }
    }
}

function toggleStoryMenu(event){
event.stopPropagation();
document.getElementById('story-menu').classList.toggle('open');
clearTimeout(storyTimer);
}

async function deleteCurrentStory(){
const s = activeStoryGroup[currentStoryIndex];
if(!s || s.uid !== currentUser.uid) return;
if(!confirm("Are you sure you want to delete this story?")) {
storyTimer = setTimeout(nextStorySegment, 5000);
return;
}
document.getElementById('story-menu').classList.remove('open');
showToast("Deleting story...");
try {
await db.collection('stories').doc(s.id).delete();
showToast("Story deleted!");
closeStory();
} catch(e) {
showToast("Failed to delete story");
}
}

async function reactToCurrentStory(){
    if(!activeStoryGroup||currentStoryIndex>=activeStoryGroup.length)return;
    const s=activeStoryGroup[currentStoryIndex];
    const ref=db.collection('stories').doc(s.id);
    const reactBtn=document.getElementById('sv-react-btn');
    const reactCountDisplay=document.getElementById('sv-react-count'); //  

        if(s.reacts&&s.reacts.includes(currentUser.uid)){
        //    
        await ref.update({reacts:firebase.firestore.FieldValue.arrayRemove(currentUser.uid)});
        s.reacts=s.reacts.filter(id=>id!==currentUser.uid);
        
        reactBtn.style.color='#fff';
        reactBtn.className='ph-bold ph-heart';
        reactCountDisplay.textContent = s.reacts.length; //  
    }else{
        //    
        await ref.update({reacts:firebase.firestore.FieldValue.arrayUnion(currentUser.uid)});
        if(!s.reacts)s.reacts=[];
        s.reacts.push(currentUser.uid);
        
        reactBtn.style.color='var(--danger)';
        reactBtn.className='ph-fill ph-heart';
        reactCountDisplay.textContent = s.reacts.length; //  
        // ...
        
        if(s.uid!==currentUser.uid){
            db.collection('notifications').add({
                toUid:s.uid,fromUid:currentUser.uid,
                fromName:currentUserData.name,
                type:'like',read:false,
                createdAt:firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    }
}
// ===== POSTS AND LIKE LOGIC =====
//      (Optimistic UI Update)
async function toggleLike(pid) {
    if (!currentUser || !checkRateLimit()) return;

    // .           (!)
    const likeButtons = document.querySelectorAll(`button[onclick*="toggleLike('${pid}')"]`);
    
    let isCurrentlyLiked = false;
    let currentLikes = 0;

    likeButtons.forEach(btn => {
        const icon = btn.querySelector('i');
        const countSpan = btn.querySelector('span');
        currentLikes = parseInt(countSpan.innerText) || 0;
        isCurrentlyLiked = btn.classList.contains('liked');

        if (isCurrentlyLiked) {
            //  
            btn.classList.remove('liked');
            if (icon) icon.className = 'ph-bold ph-heart';
            if (countSpan) countSpan.innerText = Math.max(0, currentLikes - 1);
        } else {
            //  
            btn.classList.add('liked');
            if (icon) icon.className = 'ph-fill ph-heart';
            if (countSpan) countSpan.innerText = currentLikes + 1;
        }
    });

    // .     
    const ref = db.collection('posts').doc(pid);
    const doc = await ref.get();
    
    if (doc.exists) {
        const p = doc.data();
        let likedBy = p.likedBy || [];
        let likes = p.likes || 0;
        
        if (likedBy.includes(currentUser.uid)) {
            likedBy = likedBy.filter(id => id !== currentUser.uid);
            likes = Math.max(0, likes - 1);
        } else {
            likedBy.push(currentUser.uid);
            likes++;
            
            //          
            if (p.uid !== currentUser.uid) {
                db.collection('notifications').add({
                    toUid: p.uid, 
                    fromUid: currentUser.uid,
                    fromName: currentUserData.name,
                    type: 'like', 
                    postId: pid, 
                    read: false,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                awardPoints(p.uid, 5);
            }
        }
        await ref.update({ likes, likedBy });
    }
}

function handleDoubleTap(pid,event){
const post=event.currentTarget;
const heart=post.querySelector('.double-tap-heart');
if(!heart)return;
heart.classList.remove('show');
void heart.offsetWidth;
heart.classList.add('show');
const ref=db.collection('posts').doc(pid);
ref.get().then(doc=>{
if(doc.exists){
const p=doc.data();
const likedBy=p.likedBy||[];
if(!likedBy.includes(currentUser.uid)){
toggleLike(pid);
}
}
});
}

async function openCommentPanel(pid) {
    activeCommentPostId = pid;
    document.getElementById('comment-panel').classList.add('open');
    if (commentPanelListener) commentPanelListener();
    
    // . 'window.allUsersCache'    'allUsersCache'    (  )
    if (!allUsersCache) {
        await fetchAllUsers();
    }
    
    commentPanelListener = db.collection('posts').doc(pid).onSnapshot(doc => {
        const list = document.getElementById('comment-list');
        if (!doc.exists) { list.innerHTML = '<div class="empty-feed">Post deleted</div>'; return; }
        
        const comments = doc.data().comments || [];
        
        list.innerHTML = comments.map((c, idx) => {
            const safeCName = escapeHTML(c.name);
            let safeCText = escapeHTML(c.text);
            
            // ---      ---
            if (allUsersCache) { //  window   
                const sortedUsers = [...allUsersCache].sort((a, b) => (b.name || '').length - (a.name || '').length);
                sortedUsers.forEach(u => {
                    if (u.name) {
                        const regex = new RegExp(`@${u.name}`, 'gi'); 
                        safeCText = safeCText.replace(regex, `<strong style="color:var(--accent); cursor:pointer;" onclick="event.stopPropagation(); closeCommentPanel(); viewUserProfile('${u.id}')">@${u.name}</strong>`);
                    }
                });
            }
            
            let repliesHtml = '';
            if (c.replies) {
                repliesHtml = c.replies.map(r => {
                    const safeRName = escapeHTML(r.name);
                    let safeRText = escapeHTML(r.text);
                    
                    // ---      ---
                    if (allUsersCache) { //  window   
                        const sortedUsers = [...allUsersCache].sort((a, b) => (b.name || '').length - (a.name || '').length);
                        sortedUsers.forEach(u => {
                            if (u.name) {
                                const regex = new RegExp(`@${u.name}`, 'gi');
                                safeRText = safeRText.replace(regex, `<strong style="color:var(--accent); cursor:pointer;" onclick="event.stopPropagation(); closeCommentPanel(); viewUserProfile('${u.id}')">@${u.name}</strong>`);
                            }
                        });
                    }
                    
                    return `<div style="margin-top:8px;margin-left:16px;padding-left:12px;border-left:2px solid var(--border);">
                    <div class="comment-author" style="font-size:12px; cursor:pointer;" onclick="closeCommentPanel(); viewUserProfile('${r.uid}')">${safeRName}</div>
                    <div style="font-size:12px;margin-top:2px;">${safeRText}</div>
                    </div>`;
                }).join('');
            }
            
                        //  /    
            const uid = currentUser ? currentUser.uid : null;
            const hasLiked = c.likedBy && c.likedBy.includes(uid);
            const hasDisliked = c.dislikedBy && c.dislikedBy.includes(uid);
            
            //        
            const likeIcon = hasLiked ? 'ph-fill ph-heart' : 'ph-bold ph-heart';
            const likeColor = hasLiked ? 'color:var(--danger);' : 'color:var(--text-muted);';
            
            const dislikeIcon = hasDisliked ? 'ph-fill ph-thumbs-down' : 'ph-bold ph-thumbs-down';
            const dislikeColor = hasDisliked ? 'color:var(--accent);' : 'color:var(--text-muted);';

                        //  NEW:       
            let commentAvHtml = avatarInitial(c.name);
            if (allUsersCache) {
                const commentUser = allUsersCache.find(u => u.id === c.uid);
                if (commentUser && commentUser.avatar) {
                    commentAvHtml = `<img src="${escapeHTML(commentUser.avatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
                }
            }

            //       
            const commentImageHtml = c.imageUrl ? `<img src="${escapeHTML(c.imageUrl)}" style="width:100%; max-width:250px; border-radius:12px; margin-top:8px; cursor:pointer; box-shadow:var(--shadow-sm);" onclick="openImageZoom('${escapeHTML(c.imageUrl)}')">` : '';

                        return `<div class="comment-item" ondblclick="showCommentActions('${pid}', ${idx}, '${c.uid}')">
                <div class="avatar sm" style="flex-shrink:0; cursor:pointer; margin-top:2px;" onclick="closeCommentPanel(); viewUserProfile('${c.uid}')">${commentAvHtml}</div>
                <div style="flex:1; min-width:0;">
                    
                    <!--     -   -->
                    <div style="background:var(--surface-2); padding:10px 14px; border-radius:4px 18px 18px 18px; display:inline-block; border:1px solid var(--border);">
                        <div class="comment-author" style="cursor:pointer; font-size:13px; margin-bottom:4px;" onclick="closeCommentPanel(); viewUserProfile('${c.uid}')">${safeCName}</div>
                        ${safeCText ? `<div style="font-size:14px; color:var(--text); line-height:1.4;">${safeCText}</div>` : ''}
                    </div>
                    ${commentImageHtml}
                    
                    <!--  ,     ( ) -->
                    <div style="display:flex; gap:16px; margin-top:6px; margin-left:12px; align-items:center;">
                        <div style="display:flex; align-items:center; gap:6px; cursor:pointer; transition:0.2s; ${likeColor}" onclick="toggleCommentReaction('${pid}', ${idx}, 'like')">
                            <i class="${likeIcon}" style="font-size:16px;"></i> 
                            <span style="font-size:12px; font-weight:800;">${c.likes || 0}</span>
                        </div>
                        <div style="display:flex; align-items:center; gap:6px; cursor:pointer; transition:0.2s; ${dislikeColor}" onclick="toggleCommentReaction('${pid}', ${idx}, 'dislike')">
                            <i class="${dislikeIcon}" style="font-size:16px;"></i> 
                            <span style="font-size:12px; font-weight:800;">${c.dislikes || 0}</span>
                        </div>
                        <div style="font-size:12px; color:var(--text-muted); cursor:pointer; font-weight:700;" onclick="showReplyInput('${pid}',${idx},'${safeCName}')">Reply</div>
                    </div>
                    
                    <div id="reply-input-${idx}"></div>
                    ${repliesHtml}
                </div>
            </div>`;
        }).join('');
    });
}


async function toggleCommentReaction(pid, commentIdx, type) {
    if (!currentUser || !checkRateLimit()) return;
    const ref = db.collection('posts').doc(pid);
    const doc = await ref.get();
    if (!doc.exists) return;
    
    let comments = doc.data().comments || [];
    let comment = comments[commentIdx];
    if (!comment) return;
    
    //          (  )
    if (!comment.likedBy) comment.likedBy = [];
    if (!comment.dislikedBy) comment.dislikedBy = [];
    
    const uid = currentUser.uid;
    const hasLiked = comment.likedBy.includes(uid);
    const hasDisliked = comment.dislikedBy.includes(uid);
    
    let toastMsg = '';

    if (type === 'like') {
        if (hasLiked) {
            //      
            comment.likedBy = comment.likedBy.filter(id => id !== uid);
            comment.likes = Math.max(0, (comment.likes || 0) - 1);
            toastMsg = 'Like removed';
        } else {
            //          
            comment.likedBy.push(uid);
            comment.likes = (comment.likes || 0) + 1;
            
            if (hasDisliked) {
                comment.dislikedBy = comment.dislikedBy.filter(id => id !== uid);
                comment.dislikes = Math.max(0, (comment.dislikes || 0) - 1);
            }
            toastMsg = 'Liked!';
        }
    } else if (type === 'dislike') {
        if (hasDisliked) {
            //      
            comment.dislikedBy = comment.dislikedBy.filter(id => id !== uid);
            comment.dislikes = Math.max(0, (comment.dislikes || 0) - 1);
            toastMsg = 'Dislike removed';
        } else {
            //          
            comment.dislikedBy.push(uid);
            comment.dislikes = (comment.dislikes || 0) + 1;
            
            if (hasLiked) {
                comment.likedBy = comment.likedBy.filter(id => id !== uid);
                comment.likes = Math.max(0, (comment.likes || 0) - 1);
            }
            toastMsg = 'Disliked!';
        }
    }
    
    //  reactedBy      (   )
    if (comment.reactedBy && comment.reactedBy.includes(uid)) {
        comment.reactedBy = comment.reactedBy.filter(id => id !== uid);
    }
    
    await ref.update({ comments });
    showToast(toastMsg);
}

//       (Fixed)
function showReplyInput(pid, idx, name) {
    const container = document.getElementById(`reply-input-${idx}`);
    if (!container) return;
    
    if (container.innerHTML.trim() !== '') {
        container.innerHTML = '';
        return;
    }
    
    // button  onclick  event.stopPropagation()   ,      
    container.innerHTML = `
        <div class="reply-input-container">
            <input type="text" id="reply-text-${idx}" placeholder="Reply to ${escapeHTML(name)}..." onclick="event.stopPropagation();" onkeypress="if(event.key==='Enter'){event.stopPropagation(); submitReply('${pid}', ${idx});}">
            <button onclick="event.stopPropagation(); submitReply('${pid}', ${idx})"><i class="ph-bold ph-paper-plane-right" style="font-size: 16px;"></i></button>
        </div>
    `;
    
    setTimeout(() => {
        const inp = document.getElementById(`reply-text-${idx}`);
        if (inp) inp.focus();
    }, 50);
}

//      
async function submitReply(pid, idx) {
    const input = document.getElementById(`reply-text-${idx}`);
    if (!input) return;
    const txt = input.value.trim();
    if (!txt) return;
    
    input.disabled = true; //     
    
    const ref = db.collection('posts').doc(pid);
    const doc = await ref.get();
    if (!doc.exists) return;
    
    let comments = doc.data().comments || [];
    if (!comments[idx]) return;
    if (!comments[idx].replies) comments[idx].replies = [];
    
    comments[idx].replies.push({
        uid: currentUser.uid,
        name: currentUserData.name,
        text: txt,
        time: Date.now()
    });
    
    await ref.update({ comments });
    if (doc.data().uid !== currentUser.uid) {
        awardPoints(doc.data().uid, 10);
    }
    showToast('Reply added!');
    
    //        
    const container = document.getElementById(`reply-input-${idx}`);
    if (container) container.innerHTML = '';
}

// ===== OTHER PROFILE LOGIC =====
async function viewUserProfile(uid){
    if(uid===currentUser.uid){
        showPage('profile');
        return;
    }
    currentOtherProfileUid=uid;
    document.getElementById('page-other-profile').classList.add('open');
    const doc=await db.collection('users').doc(uid).get();
    if(!doc.exists)return;
    const u=doc.data();
    
    const safeName=escapeHTML(u.name);
    const verifiedBadge = getVerifiedBadge(u.email, u.isVerified);

        // ---         ---
    const nameHtml = `
        <div style="display: inline; line-height: 1.4;">
            ${safeName}
            <span style="display: inline-flex; vertical-align: middle; margin-top: -2px; margin-left: 2px;">${verifiedBadge}</span>
        </div>
    `;
    document.getElementById('other-profile-name').innerHTML = nameHtml;
        //      
    const otherUsernameDisplay = document.getElementById('other-profile-username-display');
    if (otherUsernameDisplay) {
        if (u.username) {
            otherUsernameDisplay.style.display = 'block';
            otherUsernameDisplay.textContent = '@' + u.username;
        } else {
            otherUsernameDisplay.style.display = 'none';
        }
    }
    // ------------------------------------------------

    const avHtml=u.avatar?`<img src="${u.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`:avatarInitial(u.name);
    document.getElementById('other-profile-avatar').innerHTML=avHtml;
    
        // ---        ---
    const profileWrap = document.getElementById('other-profile-avatar').parentElement;
    const existingDot = profileWrap.querySelector('.online-dot');
    if (existingDot) existingDot.remove(); //    
    
    //    + Mutual Visibility:        
    if (currentUserData.showActiveStatus !== false && u.online === true && u.showActiveStatus !== false) {
        profileWrap.insertAdjacentHTML('beforeend', '<div class="online-dot" style="width:20px; height:20px; bottom:2px; right:2px; border:4px solid var(--bg);"></div>');
    }    

    document.getElementById('other-profile-bio').textContent=u.bio||'';

    
    const otherFollowersCount = document.getElementById('other-followers-count');
    const otherFollowingCount = document.getElementById('other-following-count');
    if(otherFollowersCount) otherFollowersCount.textContent = (u.followers || []).length;
    if(otherFollowingCount) {
        if (u.followingPrivacy === 'onlyme') {
            otherFollowingCount.textContent = '';
        } else {
            otherFollowingCount.textContent = (u.following || []).length;
        }
    }
    
    let dHtml='';
    if(u.gender) dHtml += `<div class="detail-item"><i class="ph-bold ph-user" style="font-size:20px; color:var(--accent-dark);"></i> <strong>${escapeHTML(u.gender)}</strong></div>`;
    if(u.profession) dHtml += `<div class="detail-item"><i class="ph-bold ph-briefcase" style="font-size:20px; color:var(--accent-dark);"></i> <strong>${escapeHTML(u.profession)}</strong></div>`;
    if(u.location) dHtml += `<div class="detail-item"><i class="ph-bold ph-map-pin" style="font-size:20px; color:var(--accent-dark);"></i> Lives in <strong>${escapeHTML(u.location)}</strong></div>`;
    if(u.hometown) dHtml += `<div class="detail-item"><i class="ph-bold ph-house" style="font-size:20px; color:var(--accent-dark);"></i> From <strong>${escapeHTML(u.hometown)}</strong></div>`;
    if(u.relationship) dHtml += `<div class="detail-item"><i class="ph-bold ph-heart" style="font-size:20px; color:var(--accent-dark);"></i> <strong>${escapeHTML(u.relationship)}</strong></div>`;
    if(u.phone) dHtml += `<div class="detail-item"><i class="ph-bold ph-phone" style="font-size:20px; color:var(--accent-dark);"></i> <strong>${escapeHTML(u.phone)}</strong></div>`;
    if(u.email) dHtml += `<div class="detail-item"><i class="ph-bold ph-envelope-simple" style="font-size:20px; color:var(--accent-dark);"></i> <strong>${escapeHTML(u.email)}</strong></div>`;

    document.getElementById('other-profile-details-display').innerHTML=dHtml; 
    //     Premium Check (Without Badge) 
    const otherProfileHeader = document.querySelector('#page-other-profile .profile-header');
    
    if (u.isVerified) {
        otherProfileHeader.classList.add('verified-premium');
    } else {
        otherProfileHeader.classList.remove('verified-premium');
    }
    
    const isBlocked=currentUserData.blockedUsers?.includes(uid);
    const isFollowing=currentUserData.following?.includes(uid);
    let btnHtml='';
    
    //         flex: 1   
    if(isBlocked){
        btnHtml=`<button class="icon-btn" style="flex:1; border-radius:30px; padding:10px 0; border:1px solid var(--success); color:var(--success); background:transparent; display:flex; justify-content:center; align-items:center; gap:4px; font-size:13px; font-weight:700;" onclick="unblockUser('${uid}')"><i class="ph-bold ph-lock-key-open" style="font-size:18px;"></i> Unblock</button>`;
    }else if(isFollowing){
        btnHtml=`<button class="icon-btn" style="flex:1; border-radius:30px; padding:10px 0; border:1px solid var(--text-muted); color:var(--text-muted); background:transparent; display:flex; justify-content:center; align-items:center; gap:4px; font-size:13px; font-weight:700;" onclick="toggleFollow('${uid}')"><i class="ph-bold ph-user-check" style="font-size:18px;"></i> Following</button>`;
    }else{
        btnHtml=`<button class="icon-btn" style="flex:1; border-radius:30px; padding:10px 0; background:var(--gradient); color:#fff; border:none; box-shadow:var(--shadow-glow); display:flex; justify-content:center; align-items:center; gap:4px; font-size:13px; font-weight:700;" onclick="toggleFollow('${uid}')"><i class="ph-bold ph-user-plus" style="font-size:18px;"></i> Follow</button>`;
    }
        
    const blockBtn=document.getElementById('block-user-btn');
    if(blockBtn){
        if(isBlocked){
            blockBtn.innerHTML='<i class="ph-bold ph-user-plus" style="font-size:18px;"></i> Unblock User';
        }else{
            blockBtn.innerHTML='<i class="ph-bold ph-prohibit" style="font-size:18px;"></i> Block User';
        }
    }
    
    //  flex-wrap: nowrap      ,   (Follow -> Message -> Rank)  
    document.getElementById('other-profile-btns').innerHTML=`
        <div style="display:flex; justify-content:center; gap:8px; width:100%; margin-top:16px; flex-wrap:nowrap;">
            ${btnHtml}
            <button class="icon-btn" style="flex:1; border-radius:30px; padding:10px 0; background:var(--surface-2); color:var(--text); border:1px solid var(--border); display:flex; justify-content:center; align-items:center; gap:4px; font-size:13px; font-weight:700;" onclick="closeUserProfile(); openChat('${[currentUser.uid,uid].sort().join('_')}','${uid}','${safeName}','${u.avatar||''}')">
                <i class="ph-bold ph-chat-circle-dots" style="font-size:18px;"></i> Message
            </button>
            <button class="icon-btn" style="flex:1; border-radius:30px; padding:10px 0; border:1px solid #f59e0b; color:#f59e0b; background:transparent; display:flex; justify-content:center; align-items:center; gap:4px; font-size:13px; font-weight:700;" onclick="openLeaderboard()">
                <i class="ph-bold ph-trophy" style="font-size:18px;"></i> Rank
            </button>
        </div>
    `;
    
    //      (Step 3)
    const isOwnProfile = (currentUser && currentUser.uid === uid);
    const isPrivate = (u.isPrivate === true);

    if (isPrivate && !isOwnProfile) {
        document.getElementById('other-user-posts-list').innerHTML = `
            <div style="text-align:center; padding: 60px 20px; color: var(--text-muted);">
                <span class="material-symbols-outlined" style="font-size: 60px; margin-bottom:15px; opacity:0.5; color: var(--text-secondary);">lock</span>
                <h3 style="margin-bottom: 5px; color: var(--text);">This account is private</h3>
                <p style="font-size:14px;">Only the account owner can see their posts.</p>
            </div>
        `;
    } else {
        //        
        loadOtherUserPosts(uid);
    }    
}

function closeUserProfile(){
document.getElementById('page-other-profile').classList.remove('open');
currentOtherProfileUid=null;
}

async function blockCurrentUser(){
if(!currentOtherProfileUid)return;
if(!confirm('Block this user?'))return;
await db.collection('users').doc(currentUser.uid).update({
blockedUsers:firebase.firestore.FieldValue.arrayUnion(currentOtherProfileUid)
});
showToast('User blocked');
closeAllDropdowns();
viewUserProfile(currentOtherProfileUid);
}

async function unblockUser(uid){
await db.collection('users').doc(currentUser.uid).update({
blockedUsers:firebase.firestore.FieldValue.arrayRemove(uid)
});
showToast('User unblocked');
viewUserProfile(uid);
}

// ===== CHAT FUNCTIONS =====
function openChat(chatId, otherUid, otherName, otherAvatar){
    currentChatId=chatId;
    currentChatOtherUid=otherUid;
    document.getElementById('chat-screen').classList.add('open');
        //  NEW:        
    const savedDraft = localStorage.getItem('gochat_draft_' + chatId);
    document.getElementById('chat-input').value = savedDraft ? savedDraft : '';

        //  Group Security:            
    if (otherUid === 'group') {
        db.collection('chats').doc(chatId).onSnapshot(doc => {
            if (doc.exists && doc.data().members && !doc.data().members.includes(currentUser.uid)) {
                if (currentChatId === chatId && document.getElementById('chat-screen').classList.contains('open')) {
                    closeChat();
                    showToast("You are no longer a member of this group.");
                }
            }
        });
    }

    
    //     'Read'  
    db.collection('chats').doc(chatId).set({ isRead: true }, { merge: true });

    //    
    document.getElementById('chat-input-area').style.display = 'flex';
    if(typeof closeSelectionMode === 'function') closeSelectionMode();
        
    const safeName=escapeHTML(otherName);
    
     // ---   :      ---
    const chatAvatarEl = document.getElementById('chat-avatar');
    let finalOtherName = otherName;
    let finalOtherAvatar = otherAvatar;

    if (otherUid === 'group') {
        db.collection('chats').doc(chatId).get().then(doc => {
            if (doc.exists) {
                const gName = doc.data().groupName || 'Group Chat';
                const gAv = doc.data().groupAvatar || '';
                document.getElementById('chat-name-display').textContent = gName;
                chatAvatarEl.innerHTML = gAv ? `<img src="${escapeHTML(gAv)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : `<div style="width:100%;height:100%;background:var(--gradient-orange);color:white;display:flex;align-items:center;justify-content:center;border-radius:50%;"><span class="material-symbols-outlined" style="font-size: 20px;">groups</span></div>`;
            }
        });
    } else {
        const liveUser = allUsersCache ? allUsersCache.find(u => u.id === otherUid) : null;
        if (liveUser) {
            finalOtherName = liveUser.name || finalOtherName;
            finalOtherAvatar = liveUser.avatar || '';
        }
        
        document.getElementById('chat-name-display').textContent = finalOtherName;
        //  NEW LOGIC:        
        const isOnline = currentUserData.showActiveStatus !== false && liveUser && liveUser.online === true && liveUser.showActiveStatus !== false;
        const onlineIndicator = isOnline ? '<div class="online-dot" style="bottom: 0px; right: 0px; border: 2px solid var(--surface);"></div>' : '';

        if (finalOtherAvatar && finalOtherAvatar !== 'undefined' && finalOtherAvatar !== '') {
            chatAvatarEl.innerHTML = `<img src="${escapeHTML(finalOtherAvatar)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">${onlineIndicator}`;
        } else {
            chatAvatarEl.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:var(--gradient);color:#fff;font-weight:bold;font-size:16px;border-radius:50%;">${avatarInitial(finalOtherName)}</div>${onlineIndicator}`;
        }
    }

    
    setupTypingIndicator(chatId, otherUid);
        
    //  Check and Apply Advanced Privacy on Chat Load
    db.collection('chats').doc(chatId).get().then(doc => {
        if (doc.exists && doc.data().advancedPrivacy === true) {
            const chatMessagesEl = document.getElementById('chat-messages');
            const toggleBtn = document.getElementById('advanced-privacy-toggle');
            
            if (chatMessagesEl) chatMessagesEl.classList.add('privacy-restricted');
            if (toggleBtn) toggleBtn.classList.add('active');
        } else {
            const chatMessagesEl = document.getElementById('chat-messages');
            const toggleBtn = document.getElementById('advanced-privacy-toggle');
            
            if (chatMessagesEl) chatMessagesEl.classList.remove('privacy-restricted');
            if (toggleBtn) toggleBtn.classList.remove('active');
        }
    });
    
        //  Chat Wallpaper Set Logic (100% Working Full Screen)
    const chatScreenEl = document.getElementById('chat-screen');
    const chatMessagesEl = document.getElementById('chat-messages');
    const wallpaperBg = document.getElementById('chat-wallpaper-bg');
    
    if (currentUserData.chatWallpapers && currentUserData.chatWallpapers[chatId]) {
        const bg = currentUserData.chatWallpapers[chatId];
        if(wallpaperBg) {
            wallpaperBg.style.display = 'block';
            wallpaperBg.style.background = bg;
        }
        chatScreenEl.style.background = 'transparent';
        chatMessagesEl.style.background = 'transparent';
    } else {
        if(wallpaperBg) wallpaperBg.style.display = 'none';
        chatScreenEl.style.background = ''; 
        chatMessagesEl.style.background = ''; 
    }

    if(chatUnsub)chatUnsub();
    chatUnsub=db.collection('chats').doc(chatId).collection('messages').orderBy('createdAt').onSnapshot(snap=>{
        const list=document.getElementById('chat-messages');
        
        list.innerHTML = snap.docs.map(d=>{
            const m=d.data();
            const isMine=m.uid===currentUser.uid;
            let content='';
                        let rawText = m.text || '';
let safeText = escapeHTML(rawText);

//  NEW:   URL       
const urlRegex = /(https?:\/\/[^\s]+)/g;
safeText = safeText.replace(urlRegex, function(url) {
    return `<a href="${url}" target="_blank" style="color: inherit; text-decoration: underline; word-break: break-all;" onclick="event.stopPropagation();">${url}</a>`;
});
            //  4. Mention System Render in Chat
            if (currentChatOtherUid === 'group' && allUsersCache) {
                const sortedUsers = [...allUsersCache].sort((a, b) => (b.name || '').length - (a.name || '').length);
                sortedUsers.forEach(u => {
                    if (u.name) {
                        const regex = new RegExp(`@${u.name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}`, 'gi');
                        safeText = safeText.replace(regex, `<strong style="color:var(--accent); cursor:pointer;" onclick="event.stopPropagation(); viewUserProfile('${u.id}')">@${u.name}</strong>`);
                    }
                });
            }

                       //  NEW: Shared Post rendering in chat
            if (m.sharedPostId) {
                const safeImg = m.sharedPostImg ? escapeHTML(m.sharedPostImg) : '';
                const safeTitle = escapeHTML(m.sharedPostTitle || 'View Post');
                
                content = `
                <div onclick="closeChat(); openSinglePostView('${m.sharedPostId}')" style="cursor:pointer; background:var(--surface-2); border:1px solid var(--border); border-radius:12px; overflow:hidden; width:220px; margin-bottom:4px; box-shadow:var(--shadow-sm);">
                    ${safeImg ? `<img src="${safeImg}" style="width:100%; height:120px; object-fit:cover; margin:0; border-radius:0; display:block;">` : ''}
                    <div style="padding:10px; font-size:13px; font-weight:700; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        <i class="ph-bold ph-link" style="color:var(--accent); vertical-align:middle; margin-right:4px;"></i>${safeTitle}
                    </div>
                </div>`;
            } else if(m.imageUrl){
                const safeUrl = escapeHTML(m.imageUrl);
                content=`${m.text?`<div style="margin-bottom:6px;">${safeText}</div>`:''}<img src="${safeUrl}" onclick="openImageZoom('${safeUrl}')">`;
            } else if(m.audioUrl) {
                const safeAudioUrl = escapeHTML(m.audioUrl);
                content=`${m.text?`<div style="margin-bottom:6px;">${safeText}</div>`:''}<audio class="audio-player" controls preload="metadata" style="height: 40px; border-radius: 20px;"><source src="${safeAudioUrl}" type="audio/webm"><source src="${safeAudioUrl}" type="audio/mp4">Your browser does not support audio.</audio>`;
            } else {
                content=safeText;
            }
            //      
            let replyHtml='';
            if(m.replyTo){
                let repName = m.replySender ? escapeHTML(m.replySender) : 'Someone';
                let repText = m.replyText ? escapeHTML(m.replyText) : 'Replying to a message';
                if(repText.length > 50) repText = repText.substring(0, 50) + '...';
                
                //       
                let repBg = isMine ? 'rgba(0,0,0,0.25)' : 'var(--surface-2)';
                let borderCol = isMine ? 'rgba(255,255,255,0.8)' : 'var(--accent)';
                let nameCol = isMine ? '#fff' : 'var(--accent)';
                let textCol = isMine ? 'rgba(255,255,255,0.8)' : 'var(--text-secondary)';
                
                replyHtml=`<div onclick="scrollToMessage('${m.replyTo}')" style="cursor:pointer; opacity:0.95; margin-bottom:8px; padding:8px 12px; background:${repBg}; border-radius:8px; border-left:3px solid ${borderCol}; display:flex; flex-direction:column; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <strong style="color:${nameCol}; font-size:11px; margin-bottom:3px; letter-spacing:0.3px;">${repName}</strong>
                    <span style="font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color: ${textCol};">${repText}</span>
                </div>`;
            }

            let timeString = 'Sending...';
            if (m.createdAt) {
                const date = m.createdAt.toDate ? m.createdAt.toDate() : new Date(m.createdAt);
                timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
            let timeAndReceiptHtml = `<div style="font-size: 10px; opacity: 0.7; text-align: right; margin-top: 5px; display: flex; justify-content: flex-end; gap: 4px; align-items: center;">
                <span>${timeString}</span>`;
            if(isMine){
                if(m.read){
                    timeAndReceiptHtml += `<span class="material-symbols-outlined filled" style="font-size: 14px; color: #4ade80;">done_all</span>`;
                }else{
                    timeAndReceiptHtml += `<span class="material-symbols-outlined" style="font-size: 14px;">done</span>`;
                }
            }
            timeAndReceiptHtml += `</div>`;

            let reactionsHtml = '';
            if (m.reactions && Object.keys(m.reactions).length > 0) {
                reactionsHtml = '<div class="message-reactions">';
                for (let emoji in m.reactions) {
                    const count = m.reactions[emoji].length;
                    const hasReacted = m.reactions[emoji].includes(currentUser.uid);
                    reactionsHtml += `<span class="reaction-badge" onclick="toggleMessageReaction('${d.id}','${emoji}')" style="${hasReacted?'background:var(--accent-glow);border-color:var(--accent);':''}">${emoji} ${count}</span>`;
                }
                reactionsHtml += '</div>';
            }

            let senderNameHtml = '';
            if (otherUid === 'group' && !isMine && m.senderName) {
                senderNameHtml = `<div style="font-size: 12px; font-weight: 800; color: #ff7e67; margin-bottom: 6px; cursor: pointer;" onclick="viewUserProfile('${m.uid}')">${escapeHTML(m.senderName)}</div>`;
            }

                    // ??  : Message Bubble Avatar Fix
        let msgAvatarHtml = '';
        if (!isMine) {
            let sAv = finalOtherAvatar;
            let sNm = finalOtherName;
            if (otherUid === 'group') {
                const sUser = allUsersCache ? allUsersCache.find(u => u.id === m.sender) : null;
                sAv = sUser ? sUser.avatar : '';
                sNm = sUser ? sUser.name : (m.senderName || '?');
            }
            if (sAv && sAv !== 'undefined' && sAv !== '') {
                msgAvatarHtml = `<div class="avatar sm" style="align-self: flex-end; margin-right: 8px; flex-shrink:0;"><img src="${escapeHTML(sAv)}"></div>`;
            } else {
                msgAvatarHtml = `<div class="avatar sm" style="align-self: flex-end; margin-right: 8px; flex-shrink:0; font-size:12px; background:var(--surface-2); color:var(--text); border:1px solid var(--border);">${avatarInitial(sNm)}</div>`;
            }
        }

        if (m.deletedFor && m.deletedFor.includes(currentUser.uid)) { return ''; }

        return `<div class="chat-bubble-wrapper ${isMine?'mine':'theirs'}" data-msgid="${d.id}" ontouchstart="handleMsgTouchStart('${d.id}', event)" ontouchmove="handleMsgTouchMove(event)" ontouchend="handleMsgTouchEnd('${d.id}', event)" ontouchcancel="handleMsgTouchEnd('${d.id}', event)" onmousedown="handleMsgTouchStart('${d.id}', event)" onmouseup="handleMsgTouchEnd('${d.id}', event)" onmouseleave="handleMsgTouchEnd('${d.id}', event)" oncontextmenu="event.preventDefault(); return false;" onclick="handleMsgClick('${d.id}')">
            <div style="display:flex; flex-direction:row; align-items:flex-end; width:100%; ${isMine?'justify-content:flex-end;':''}">
                ${!isMine ? msgAvatarHtml : ''}
                <div class="chat-bubble ${isMine?'mine':'theirs'}" ondblclick="showReactionPicker(event,'${d.id}')">
                    ${senderNameHtml}
                    ${replyHtml}
                    ${content}
                    ${timeAndReceiptHtml}
                </div>
            </div>
            ${reactionsHtml}
        </div>`;


            return `<div class="chat-bubble-wrapper ${isMine?'mine':'theirs'}" data-msgid="${d.id}" 
            ontouchstart="handleMsgTouchStart('${d.id}', event)" 
            ontouchmove="handleMsgTouchMove(event)"
            ontouchend="handleMsgTouchEnd('${d.id}', event)" 
            ontouchcancel="handleMsgTouchEnd('${d.id}', event)"
            onmousedown="handleMsgTouchStart('${d.id}', event)" 
            onmouseup="handleMsgTouchEnd('${d.id}', event)" 
            onmouseleave="handleMsgTouchEnd('${d.id}', event)"
            oncontextmenu="event.preventDefault(); return false;"
            onclick="handleMsgClick('${d.id}')">

            <div class="chat-bubble ${isMine?'mine':'theirs'}" ondblclick="showReactionPicker(event,'${d.id}')">
            ${senderNameHtml}
            ${replyHtml}
            ${content}
            ${timeAndReceiptHtml}
            </div>
            ${reactionsHtml}
            </div>`;
        }).join(''); 
        
        list.scrollTop=list.scrollHeight;
        
        snap.docs.forEach(d=>{
            const m=d.data();
            if(m.uid!==currentUser.uid&&!m.read){
                d.ref.update({read:true,readAt:firebase.firestore.FieldValue.serverTimestamp()}).catch(()=>{});
            }
        });
    });
}

function setupTypingIndicator(chatId, otherUid) {
    const chatRef = db.collection('chats').doc(chatId);
    if (onlineUnsub) onlineUnsub();
    onlineUnsub = chatRef.onSnapshot(doc => {
        if (!doc.exists) return;
        const data = doc.data();
        
        
        // ---  4. Group Mention Setup (Load Members) ---
        if(data.isGroup && data.members) {
            mentionData.friends = data.members.map(uid => {
                const u = allUsersCache ? allUsersCache.find(user => user.id === uid) : null;
                return { uid, name: u ? u.name : 'User', avatar: u ? u.avatar : '' };
            });
        }

        // --- Typing Logic ---
        const typingUser = data.typing;
        const typingEl = document.getElementById('typing-indicator');
        if (typingUser && typingUser !== currentUser.uid && (typingUser === otherUid || data.isGroup)) {
            if (!typingEl) {
                const indicator = document.createElement('div');
                indicator.id = 'typing-indicator';
                indicator.className = 'typing-indicator';
                indicator.innerHTML = '<span></span><span></span><span></span>';
                document.getElementById('chat-messages').appendChild(indicator);
            }
            const list = document.getElementById('chat-messages');
            list.scrollTop = list.scrollHeight;
        } else {
            if (typingEl) typingEl.remove();
        }
    });
}
function setTypingStatus(isTyping) {
if (!currentChatId || !currentUser) return;
if (typingTimeout) clearTimeout(typingTimeout);
if (isTyping) {
db.collection('chats').doc(currentChatId).set({
typing: currentUser.uid,
typingAt: firebase.firestore.FieldValue.serverTimestamp()
}, { merge: true });
typingTimeout = setTimeout(() => {
db.collection('chats').doc(currentChatId).set({
typing: null
}, { merge: true });
}, 2000);
} else {
db.collection('chats').doc(currentChatId).set({
typing: null
}, { merge: true });
}
}

function showReactionPicker(event, msgId) {
    event.stopPropagation();
    const existing = document.querySelector('.reaction-picker.show');
    if (existing) existing.remove();
    
    const wrapper = event.currentTarget.closest('.chat-bubble-wrapper');
    const picker = document.createElement('div');
    picker.className = 'reaction-picker show';
    
        //  NEW:       
    picker.innerHTML = `
        <span class="reaction-emoji" onclick="toggleMessageReaction('${msgId}','')"></span>
        <span class="reaction-emoji" onclick="toggleMessageReaction('${msgId}','')"></span>
        <span class="reaction-emoji" onclick="toggleMessageReaction('${msgId}','')"></span>
        <span class="reaction-emoji" onclick="toggleMessageReaction('${msgId}','')"></span>
        <span class="reaction-emoji" onclick="toggleMessageReaction('${msgId}','')"></span>
    `;
    
    wrapper.appendChild(picker);
    
    //      -   
    setTimeout(() => {
        document.addEventListener('click', function closePicker() {
            if(picker) picker.remove();
            document.removeEventListener('click', closePicker);
        }, { once: true });
    }, 100);
}

async function toggleMessageReaction(msgId, emoji) {
if (!checkRateLimit()) return;
const ref = db.collection('chats').doc(currentChatId).collection('messages').doc(msgId);
const doc = await ref.get();
if (!doc.exists) return;
const data = doc.data();
let reactions = data.reactions || {};
if (!reactions[emoji]) reactions[emoji] = [];
const idx = reactions[emoji].indexOf(currentUser.uid);
if (idx > -1) {
reactions[emoji].splice(idx, 1);
if (reactions[emoji].length === 0) delete reactions[emoji];
} else {
reactions[emoji].push(currentUser.uid);
}
await ref.update({ reactions });
const picker = document.querySelector('.reaction-picker.show');
if (picker) picker.remove();
}

function showMessageMenu(event, msgId) {
    event.stopPropagation();
    const existing = document.querySelector('.chat-bubble-menu.show');
    if (existing) existing.remove();
    
    const wrapper = event.currentTarget.closest('.chat-bubble-wrapper');
    const isMine = wrapper.classList.contains('mine'); //      
    
    const menu = document.createElement('div');
    menu.className = 'chat-bubble-menu show';
    
    //         (    )
    const alignPosition = isMine ? 'right: 35px;' : 'left: 35px;';
    
    menu.style.cssText = `position:absolute; top: 10px; ${alignPosition} background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:6px; z-index:99999; box-shadow:var(--shadow-lg); width: 150px;`;
        
    menu.innerHTML = `
    <div style="padding:10px 12px;cursor:pointer;font-size:14px;font-weight:600;border-radius:8px; display:flex; gap:10px; align-items:center; color:var(--text);" onclick="replyToMessage('${msgId}')">
        <span class="material-symbols-outlined" style="font-size:18px;">reply</span> Reply
    </div>
    <div style="padding:10px 12px;cursor:pointer;font-size:14px;font-weight:600;border-radius:8px;color:var(--danger); display:flex; gap:10px; align-items:center;" onclick="deleteMessage('${msgId}')">
        <span class="material-symbols-outlined" style="font-size:18px;">delete</span> Delete
    </div>
    `;
    
    wrapper.appendChild(menu);
    
    setTimeout(() => {
        document.addEventListener('click', function closeMenu() {
            if(menu) menu.remove();
            document.removeEventListener('click', closeMenu);
        }, { once: true });
    }, 100);
}


async function replyToMessage(msgId) {
    currentReplyMsgId = msgId;
    const input = document.getElementById('chat-input');
    input.focus();
    
    //        
    try {
        const doc = await db.collection('chats').doc(currentChatId).collection('messages').doc(msgId).get();
        if(doc.exists) {
            replyToMsgData = doc.data();
            let shortText = replyToMsgData.text ? escapeHTML(replyToMsgData.text) : ' Photo';
            if(shortText.length > 50) shortText = shortText.substring(0, 50) + '...';
            
            const container = document.getElementById('reply-preview-container');
            container.innerHTML = `
                <div class="reply-preview" style="display:flex; justify-content:space-between; align-items:center; background:var(--surface-2); padding:10px 14px; border-left:4px solid var(--accent); border-radius:16px 16px 0 0; margin-bottom:0; width:100%; border: 1px solid var(--border); border-bottom: none; box-shadow: 0 -4px 15px rgba(0,0,0,0.05);">
                    <div style="display:flex; flex-direction:column; overflow:hidden; flex: 1; margin-right: 10px;">
                        <span style="font-size:12px; font-weight:800; color:var(--accent); margin-bottom:2px;">Replying to ${escapeHTML(replyToMsgData.senderName || 'User')}</span>
                        <span style="font-size:13px; color:var(--text-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${shortText}</span>
                    </div>
                    <span class="material-symbols-outlined" style="cursor:pointer; color:var(--text-muted); padding:6px; background:rgba(0,0,0,0.1); border-radius:50%; flex-shrink: 0;" onclick="cancelReply()">close</span>
                </div>
            `;
            input.placeholder = 'Reply to ' + (replyToMsgData.senderName || 'User') + '...';
        }
    } catch(e) { console.error(e); }
}

function cancelReply() {
    currentReplyMsgId = null;
    replyToMsgData = null;
    document.getElementById('reply-preview-container').innerHTML = '';
    document.getElementById('chat-input').placeholder = 'Message...';
}

async function deleteMessage(msgId) {
if (!confirm('Delete this message?')) return;
await db.collection('chats').doc(currentChatId).collection('messages').doc(msgId).delete();
showToast('Message deleted');
}

function closeChat(){
document.getElementById('chat-screen').classList.remove('open');

//     -    
const wallpaperBg = document.getElementById('chat-wallpaper-bg');
if(wallpaperBg) wallpaperBg.style.display = 'none';

if(chatUnsub)chatUnsub();
if(onlineUnsub)onlineUnsub();
currentChatId=null;
currentChatOtherUid=null;
setTypingStatus(false);
}

async function sendMsg(){
const inp=document.getElementById('chat-input');
const text=inp.value.trim();
if(!text||!currentChatId||!checkRateLimit())return;
inp.value='';
    //  NEW:      
    if(currentChatId) localStorage.removeItem('gochat_draft_' + currentChatId);    
setTypingStatus(false);
const msgData={
uid:currentUser.uid,
senderName: currentUserData.name || 'User', // <--    
text:text,
createdAt:firebase.firestore.FieldValue.serverTimestamp()
};
//        
if(currentReplyMsgId && replyToMsgData){
    msgData.replyTo = currentReplyMsgId;
    msgData.replySender = replyToMsgData.senderName || 'User';
    msgData.replyText = replyToMsgData.text || ' Photo';
    
    //  
    currentReplyMsgId = null;
    replyToMsgData = null;
    document.getElementById('reply-preview-container').innerHTML = '';
    inp.placeholder = 'Message...';
}
await db.collection('chats').doc(currentChatId).collection('messages').add(msgData);

//      ( )
let lastText = text;
if (currentChatOtherUid === 'group') {
    lastText = (currentUserData.name || 'User') + ": " + text;
}

await db.collection('chats').doc(currentChatId).set({
    lastMsg: lastText,
    lastAt: firebase.firestore.FieldValue.serverTimestamp(),
    names: { 
        [currentUser.uid]: currentUserData.name, 
        [currentChatOtherUid]: document.getElementById('chat-name-display').textContent 
    },
    avatars: { 
        [currentUser.uid]: currentUserData.avatar || '', 
        [currentChatOtherUid]: '' 
    },
    lastSender: currentUser.uid, //   
    isRead: false //    
}, { merge: true });
}

async function sendChatImage(input){
const file=input.files[0];
if(!file||!currentChatId)return;
showToast('Uploading image...');
try{
const url=await uploadToCloudinary(file,false);
let imageMsgData = {
    uid:currentUser.uid,
    senderName: currentUserData.name || 'User',
    text:'',
    imageUrl:url,
    createdAt:firebase.firestore.FieldValue.serverTimestamp()
};

//       
if(currentReplyMsgId && replyToMsgData){
    imageMsgData.replyTo = currentReplyMsgId;
    imageMsgData.replySender = replyToMsgData.senderName || 'User';
    imageMsgData.replyText = replyToMsgData.text || ' Photo';
    
    currentReplyMsgId = null;
    replyToMsgData = null;
    document.getElementById('reply-preview-container').innerHTML = '';
    document.getElementById('chat-input').placeholder = 'Message...';
}
await db.collection('chats').doc(currentChatId).collection('messages').add({
uid:currentUser.uid,
senderName: currentUserData.name || 'User', // <--     
text:'',
imageUrl:url,
createdAt:firebase.firestore.FieldValue.serverTimestamp()
});

let lastText = ' Photo';
if (currentChatOtherUid === 'group') {
    lastText = (currentUserData.name || 'User') + " sent a photo";
}

await db.collection('chats').doc(currentChatId).set({
    lastMsg: lastText,
    lastAt: firebase.firestore.FieldValue.serverTimestamp(),
    lastSender: currentUser.uid,
    isRead: false
}, { merge: true });
showToast('Image sent!');
}catch(e){showToast('Failed to send image');}
input.value='';
}

// --- -   (Smart Version) ---
const notifSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');

function showInAppMessageNotification(chatId, data) {
    let senderName = 'User';
    let avatarHtml = '';
    let otherUid = 'group';

    if (data.isGroup) {
        senderName = data.groupName || 'Group';
        avatarHtml = `<div class="avatar sm" style="background:var(--gradient-orange);color:white;"><span class="material-symbols-outlined" style="font-size:18px;">groups</span></div>`;
    } else {
        const parts = chatId.split('_');
        otherUid = parts[0] === currentUser.uid ? parts[1] : parts[0];
        senderName = data.names ? data.names[otherUid] : 'User';
        const otherAv = data.avatars ? data.avatars[otherUid] : '';
        avatarHtml = otherAv ? `<img src="${escapeHTML(otherAv)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : `<div class="avatar sm" style="background:var(--gradient);color:white;">${avatarInitial(senderName)}</div>`;
    }

    const container = document.getElementById('in-app-notif-container');
    if (!container) return;

     if (currentUserData && currentUserData.messageSound !== false) {
        notifSound.play().catch(e => console.log('Sound blocked until user interaction'));
    }

    const popup = document.createElement('div');
    popup.className = 'msg-popup';
    popup.id = `popup-${chatId}`; //  FIX:         
    popup.style.flexDirection = 'column';
    popup.style.alignItems = 'stretch';

    const topContent = document.createElement('div');
    topContent.style.display = 'flex';
    topContent.style.alignItems = 'center';
    topContent.style.gap = '12px';
    
    topContent.innerHTML = `
        <div style="width:40px;height:40px;border-radius:50%;overflow:hidden;flex-shrink:0;">${avatarHtml}</div>
        <div style="flex:1; min-width:0;">
            <div style="font-size:14px; font-weight:800; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHTML(senderName)}</div>
            <div style="font-size:13px; color:var(--text-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHTML(data.lastMsg || 'Sent a message')}</div>
        </div>
    `;

    topContent.onclick = function() {
        popup.remove();
        openChat(chatId, otherUid, senderName, data.isGroup ? '' : (data.avatars ? data.avatars[otherUid] : ''));
    };

    const replyBar = document.createElement('div');
    replyBar.className = 'msg-popup-reply-bar';
    replyBar.innerHTML = `
        <input type="text" placeholder="Reply to ${escapeHTML(senderName)}..." onclick="event.stopPropagation();" onkeypress="if(event.key==='Enter'){event.stopPropagation(); sendQuickReply('${chatId}', '${otherUid}', this.value, this);}">
        <button onclick="event.stopPropagation(); sendQuickReply('${chatId}', '${otherUid}', this.previousElementSibling.value, this)">
            <span class="material-symbols-outlined" style="font-size:16px;">send</span>
        </button>
    `;

    popup.appendChild(topContent);
    popup.appendChild(replyBar);
    container.appendChild(popup);

    let startY = 0;
    let currentY = 0;
    popup.addEventListener('touchstart', (e) => { startY = e.touches[0].clientY; }, {passive: true});
    popup.addEventListener('touchmove', (e) => {
        currentY = e.touches[0].clientY;
        const diff = currentY - startY;
        if (diff < 0) { popup.style.transform = `translateY(${diff}px)`; }
    }, {passive: true});
    popup.addEventListener('touchend', (e) => {
        if (currentY - startY < -40) {
            popup.classList.add('hide');
            setTimeout(() => popup.remove(), 400);
        } else {
            popup.style.transform = '';
        }
    }, {passive: true});

    setTimeout(() => {
        if (popup.parentElement && !popup.querySelector('input:focus')) { 
            popup.classList.add('hide');
            setTimeout(() => popup.remove(), 400);
        }
    }, 5000);
}

//    
async function sendQuickReply(chatId, otherUid, text, btnElement) {
    text = text.trim();
    if(!text || !currentUser) return;
    
    //  
    btnElement.disabled = true;
    btnElement.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px; animation:spin 1s linear infinite;">autorenew</span>';

    const msgData = {
        uid: currentUser.uid,
        senderName: currentUserData.name || 'User',
        text: text,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    try {
        await db.collection('chats').doc(chatId).collection('messages').add(msgData);
        
        let lastText = text;
        if (otherUid === 'group') {
            lastText = (currentUserData.name || 'User') + ": " + text;
        }

        await db.collection('chats').doc(chatId).set({
            lastMsg: lastText,
            lastAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastSender: currentUser.uid,
            isRead: false
        }, { merge: true });

        //        
        const popup = btnElement.closest('.msg-popup');
        if(popup) {
            popup.classList.add('hide');
            setTimeout(() => popup.remove(), 400);
        }
        showToast("Reply sent!");
    } catch(e) {
        showToast("Failed to send reply");
        btnElement.disabled = false;
        btnElement.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px;">send</span>';
    }
}

// ===== STRICT & SECURE loadMessages FUNCTION =====
function loadMessages(){
    const list=document.getElementById('msg-list');
    if(!list)return;
    
    if(list.innerHTML.trim() === '') {
      if (!allUsersCache) fetchAllUsers();
        list.innerHTML = '<div class="loading" style="padding:20px;text-align:center;"><span class="material-symbols-outlined">autorenew</span> Loading...</div>';
    }
    
    if(window.chatListUnsub) window.chatListUnsub();
    
    let isInitialChatLoad = true;
    
    window.chatListUnsub = db.collection('chats').onSnapshot(snap => {
        const mutedChats = currentUserData?.mutedChats || [];
        const pinnedChats = currentUserData?.pinnedChats || [];
        const archivedChats = currentUserData?.archivedChats || [];
        const blockedUsers = currentUserData?.blockedUsers || [];
        let chats = [];

        // .   
        snap.docChanges().forEach(change => {
            const data = change.doc.data();
            const chatId = change.doc.id;
            
            let isMyChat = false;
            if (data.isGroup && data.members && data.members.includes(currentUser.uid)) {
                isMyChat = true; 
            } else if (!data.isGroup && chatId.includes(currentUser.uid)) {
                isMyChat = true; 
            }

            if (!isMyChat) return; 

            if (!isInitialChatLoad && (change.type === 'added' || change.type === 'modified')) {
                if (data.lastSender && data.lastSender !== currentUser.uid && data.isRead === false && !mutedChats.includes(chatId)) {
                    if (currentChatId !== chatId || !document.getElementById('chat-screen').classList.contains('open')) {
                        
                        window.notifiedChatsCache = window.notifiedChatsCache || {};
                        const msgTime = data.lastAt?.toMillis ? data.lastAt.toMillis() : 0;
                        
                        if (window.notifiedChatsCache[chatId] !== msgTime) {
                            window.notifiedChatsCache[chatId] = msgTime; 
                            
                            const oldPopup = document.getElementById(`popup-${chatId}`);
                            if (oldPopup) oldPopup.remove();
                            
                            showInAppMessageNotification(chatId, data);
                        }
                    }
                }
            }
        });
        isInitialChatLoad = false;

        // .   
        snap.forEach(d => {
            const data = d.data();
            const chatId = d.id;
            
            let isMyChat = false;
            if (data.isGroup && data.members && data.members.includes(currentUser.uid)) {
                isMyChat = true;
            } else if (!data.isGroup && chatId.includes(currentUser.uid)) {
                isMyChat = true;
            }

            if (!isMyChat) return; 
            
            if (data.isGroup && !archivedChats.includes(chatId)) {
                chats.push({
                    id: chatId, otherUid: 'group', otherName: data.groupName || 'Group', otherAv: 'group_icon', data: data, isGroup: true,
                    isPinned: pinnedChats.includes(chatId), isMuted: mutedChats.includes(chatId)
                });
            } else if (!data.isGroup && !archivedChats.includes(chatId)) {
                const parts = chatId.split('_');
                if (parts.length === 2) {
                    const otherUid = parts[0] === currentUser.uid ? parts[1] : parts[0];
                    if (!blockedUsers.includes(otherUid)) {
                        chats.push({
                            id: chatId, otherUid, otherName: data.names?.[otherUid] || 'User', otherAv: data.avatars?.[otherUid] || '', data, isGroup: false,
                            isPinned: pinnedChats.includes(chatId), isMuted: mutedChats.includes(chatId)
                        });
                    }
                }
            }
        });
        
        // .  (   ,   )
        chats.sort((a,b) => {
            if(a.isPinned && !b.isPinned) return -1;
            if(!a.isPinned && b.isPinned) return 1;
            const timeA = a.data.lastAt?.toMillis ? a.data.lastAt.toMillis() : 0;
            const timeB = b.data.lastAt?.toMillis ? b.data.lastAt.toMillis() : 0;
            return timeB - timeA; 
        });

        // .   
        let unreadCount = 0;
        chats.forEach(chat => {
            if (chat.data.lastSender !== currentUser.uid && chat.data.isRead === false) {
                unreadCount++;
            }
        });
        
        const badge = document.getElementById('msg-badge');
        if (badge) {
            badge.textContent = unreadCount;
            badge.style.display = unreadCount > 0 ? 'flex' : 'none';
        }

        // . HTML  (  )
        let html = '';
        chats.forEach(chat => {
            const pinIcon = chat.isPinned ? '<span class="material-symbols-outlined" style="font-size:16px;color:var(--accent);margin-right:4px;">push_pin</span>' : '';
            const muteIcon = chat.isMuted ? '<span class="material-symbols-outlined" style="font-size:16px;color:var(--text-muted);margin-right:4px;">notifications_off</span>' : '';
            
            //   
            const isUnread = (chat.data.lastSender !== currentUser.uid && chat.data.isRead === false);
            const unreadClass = isUnread ? 'unread-chat' : '';
            const unreadDot = isUnread ? '<div class="unread-badge-dot"></div>' : '';

            //  Profile Picture Real-time Fix
            let finalAv = chat.otherAv;
            let finalName = chat.otherName;

            if (chat.isGroup) {
                finalAv = chat.data.groupAvatar || '';
                finalName = chat.data.groupName || 'Group';
            } else {
                const liveUser = allUsersCache ? allUsersCache.find(u => u.id === chat.otherUid) : null;
                if (liveUser) {
                    finalAv = liveUser.avatar || '';
                    finalName = liveUser.name || 'Unknown User';
                }
            }
            
            let avHtml = '';
            if (finalAv) {
                avHtml = `<img src="${escapeHTML(finalAv)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
            } else if (chat.isGroup) {
                avHtml = `<div style="width:100%;height:100%;background:var(--gradient-orange);color:white;display:flex;align-items:center;justify-content:center;border-radius:50%;"><span class="material-symbols-outlined" style="font-size: 24px;">groups</span></div>`;
            } else {
                avHtml = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:var(--gradient);color:#fff;font-weight:bold;font-size:16px;border-radius:50%;">${avatarInitial(finalName)}</div>`;
            }
            
            chat.otherName = finalName;
            
            const chatUser = allUsersCache ? allUsersCache.find(u => u.id === chat.otherUid) : null;
            //  NEW LOGIC:        
            const isOnline = (currentUserData.showActiveStatus !== false && !chat.isGroup && chatUser && chatUser.online === true && chatUser.showActiveStatus !== false);
            const onlineIndicator = isOnline ? '<div class="online-dot"></div>' : '';

            html += `<div class="msg-item ${chat.isPinned?'pinned':''} ${chat.isMuted?'muted':''} ${unreadClass}" data-other-uid="${chat.otherUid}" onclick="openChat('${chat.id}','${chat.otherUid}','${escapeHTML(chat.otherName)}','${chat.isGroup ? '' : escapeHTML(chat.otherAv)}')">
            <div class="avatar" style="position:relative;">${avHtml}${onlineIndicator}</div>
            <div class="msg-info" style="flex:1;">
            <div class="msg-name">${pinIcon}${muteIcon}${escapeHTML(chat.otherName)}</div>
            <div class="msg-preview">${escapeHTML(chat.data.lastMsg || 'New Message')}</div>
            </div>
            
            ${unreadDot}

            <div class="msg-menu-btn" onclick="event.stopPropagation();toggleChatListMenu('${chat.id}',this)">
            <span class="material-symbols-outlined">more_vert</span>
            </div>
            <div id="chat-menu-${chat.id}" class="chat-list-menu" onclick="event.stopPropagation();">
            <div class="chat-dropdown-item" onclick="pinChat('${chat.id}')">
            <span class="material-symbols-outlined">push_pin</span> ${chat.isPinned?'Unpin':'Pin'}
            </div>
            <div class="chat-dropdown-item" onclick="muteChat('${chat.id}')">
            <span class="material-symbols-outlined">${chat.isMuted?'notifications_on':'notifications_off'}</span> ${chat.isMuted?'Unmute':'Mute'}
            </div>
            <div class="chat-dropdown-item" onclick="archiveChat('${chat.id}')">
            <span class="material-symbols-outlined">archive</span> Archive
            </div>
            <div class="chat-dropdown-item danger" onclick="deleteChat('${chat.id}')">
            <span class="material-symbols-outlined">delete</span> Delete Chat
            </div>
            </div>
            </div>`;
        });
        
        //      ,    !
        list.innerHTML = html || '<div class="empty-feed">No messages yet</div>';
    });
}

async function loadArchivedMessages(){
const list=document.getElementById('archived-msg-list');
if(!list)return;
const archivedChats=currentUserData.archivedChats||[];
if(archivedChats.length===0){
list.innerHTML='<div class="empty-feed">No archived chats</div>';
return;
}
let html='';
for(let chatId of archivedChats){
const doc=await db.collection('chats').doc(chatId).get();
if(doc.exists){
const data=doc.data();
const parts = chatId.split('_');
const otherUid = parts[0] === currentUser.uid ? parts[1] : parts[0];
const otherName=data.names?data.names[otherUid]:'User';
const otherAv=data.avatars?data.avatars[otherUid]:'';
const avHtml=otherAv?`<img src="${otherAv}">`:avatarInitial(otherName);
html+=`<div class="msg-item" onclick="openChat('${chatId}','${otherUid}','${escapeHTML(otherName)}','${escapeHTML(otherAv)}')">
<div class="avatar">${avHtml}</div>
<div class="msg-info">
<div class="msg-name">${escapeHTML(otherName)}</div>
<div class="msg-preview">${escapeHTML(data.lastMsg||'No messages')}</div>
</div>
<button class="btn-outline" style="padding:6px 12px;font-size:11px;" onclick="event.stopPropagation();unarchiveChat('${chatId}')">Unarchive</button>
</div>`;
}
}
list.innerHTML=html;
}

async function unarchiveChat(chatId){
await db.collection('users').doc(currentUser.uid).update({
archivedChats:firebase.firestore.FieldValue.arrayRemove(chatId)
});
showToast('Chat unarchived');
loadArchivedMessages();
loadMessages();
}

function toggleChatListMenu(chatId,btn){
closeAllDropdowns();
const dropdown=document.getElementById(`chat-menu-${chatId}`);
if(dropdown)dropdown.classList.toggle('open');
}

async function muteChat(chatId){
closeAllDropdowns();
const isMuted=currentUserData.mutedChats?.includes(chatId);
if(isMuted){
await db.collection('users').doc(currentUser.uid).update({
mutedChats:firebase.firestore.FieldValue.arrayRemove(chatId)
});
showToast('Chat unmuted');
}else{
await db.collection('users').doc(currentUser.uid).update({
mutedChats:firebase.firestore.FieldValue.arrayUnion(chatId)
});
showToast('Chat muted');
}
loadMessages();
}

async function pinChat(chatId){
closeAllDropdowns();
const isPinned=currentUserData.pinnedChats?.includes(chatId);
if(isPinned){
await db.collection('users').doc(currentUser.uid).update({
pinnedChats:firebase.firestore.FieldValue.arrayRemove(chatId)
});
showToast('Chat unpinned');
}else{
await db.collection('users').doc(currentUser.uid).update({
pinnedChats:firebase.firestore.FieldValue.arrayUnion(chatId)
});
showToast('Chat pinned');
}
loadMessages();
}

async function archiveChat(chatId){
closeAllDropdowns();
await db.collection('users').doc(currentUser.uid).update({
archivedChats:firebase.firestore.FieldValue.arrayUnion(chatId)
});
showToast('Chat archived');
loadMessages();
}

async function deleteChat(chatId){
if(!confirm('Delete this entire chat?'))return;
closeAllDropdowns();
try{
const batch=db.batch();
const messagesSnap=await db.collection('chats').doc(chatId).collection('messages').get();
messagesSnap.forEach(doc=>batch.delete(doc.ref));
batch.delete(db.collection('chats').doc(chatId));
await batch.commit();
showToast('Chat deleted');
loadMessages();
}catch(e){showToast('Failed to delete chat');}
}

//  -      
function openProfileEdit(){
    document.getElementById('edit-profile-screen').style.display = 'flex';
    
    document.getElementById('edit-username').value = currentUserData.username || '';
    document.getElementById('edit-name').value = currentUserData.name || '';
    document.getElementById('edit-bio').value = currentUserData.bio || '';
    document.getElementById('edit-gender').value = currentUserData.gender || '';
    document.getElementById('edit-location').value = currentUserData.location || '';
    document.getElementById('edit-phone').value = currentUserData.phone || '';
    document.getElementById('edit-email').value = currentUserData.email || ''; 
    document.getElementById('edit-hometown').value = currentUserData.hometown || '';
    document.getElementById('edit-relationship').value = currentUserData.relationship || '';
    document.getElementById('edit-profession').value = currentUserData.profession || '';
}

function closeProfileEdit(){
    document.getElementById('edit-profile-screen').style.display = 'none';
}

async function saveProfileChanges(){
    const newName = document.getElementById('edit-name').value.trim();
    const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u;
    if(emojiRegex.test(newName)){showToast('Name cannot contain emojis!'); return;}

    // .       
    const isNameChanged = (newName !== currentUserData.name);

    // .     ,      
    if (isNameChanged && currentUserData.lastNameChange) {
        const lastChange = currentUserData.lastNameChange;
        if (Date.now() - lastChange < SEVEN_DAYS_MS) {
            showToast('Name can only be changed once every 7 days'); 
            return; //         
        }
    }

    //        
    let newUsername = document.getElementById('edit-username').value.trim().toLowerCase();
    newUsername = newUsername.replace(/[^a-z0-9_]/g, '');

    // .    
    const updates = {
        username: newUsername, //  :   
        name: newName,
        bio: document.getElementById('edit-bio').value.trim(),
        gender: document.getElementById('edit-gender').value,
        location: document.getElementById('edit-location').value.trim(),
        hometown: document.getElementById('edit-hometown').value.trim(),
        relationship: document.getElementById('edit-relationship').value,
        phone: document.getElementById('edit-phone').value.trim(),
    email: document.getElementById('edit-email').value.trim(),
    profession: document.getElementById('edit-profession').value.trim()
    };

    // .    ,       
    if (isNameChanged) {
        updates.lastNameChange = Date.now(); 
    }    
showToast('Saving profile...');
await db.collection('users').doc(currentUser.uid).update(updates);
        // ===  :        ===
        try {
            // 'posts'         
            const postsSnapshot = await db.collection('posts').where('uid', '==', currentUser.uid).get();
            
            if (!postsSnapshot.empty) {
                const batch = db.batch();
                postsSnapshot.forEach((doc) => {
                    batch.update(doc.ref, { name: newName }); 
                    // (:       'authorName' ,  'name'   'authorName' )
                });
                await batch.commit(); //     !
            }
        } catch (error) {
            console.error("Error updating old posts: ", error);
        }
        // ========================================================
        
currentUserData={...currentUserData,...updates};
loadUserUI();
closeProfileEdit();
showToast('Profile updated!');
}

// ===== CREATE POST FUNCTIONS =====
function openCreatePost(){
document.getElementById('create-post-screen').classList.add('open');
checkPostInputs();
}

function closeCreatePost(){
    document.getElementById('create-post-screen').classList.remove('open');
    document.getElementById('post-title').value='';
    removePostImages();
    currentTaggedFriends=[];
    currentTaggedNames=[];
    currentPostActivity = null; //    
    document.getElementById('tag-count').style.display='none';
    updateTagPreview(); //    
}


function checkPostInputs(){
const text=document.getElementById('post-title').value.trim();
const hasImg=composeImages.length>0;
const btn=document.getElementById('modal-post-btn');
if(text||hasImg){btn.disabled=false;btn.style.opacity='1';}
else{btn.disabled=true;btn.style.opacity='0.5';}
}

function previewImages(input){
const files=Array.from(input.files);
if(!files.length)return;
const oversizedFiles = files.filter(file => file.size > MAX_FILE_SIZE);
if (oversizedFiles.length > 0) {
showToast('Maximum photo size is 5MB!');
return;
}
const remaining=MAX_IMAGES_PER_POST-composeImages.length;
const toAdd=files.slice(0,remaining);
toAdd.forEach(file=>{
const reader=new FileReader();
reader.onload=e=>{
composeImages.push({file:file,preview:e.target.result});
renderComposeImageGrid();
checkPostInputs();
};
reader.readAsDataURL(file);
});
if(files.length>remaining){showToast('Maximum 10 images allowed');}
input.value='';
}

function renderComposeImageGrid(){
const grid=document.getElementById('compose-img-grid');
const preview=document.getElementById('compose-img-preview');
if(composeImages.length===0){
preview.style.display='none';
grid.innerHTML='';
return;
}
preview.style.display='block';
let html='';
composeImages.forEach((img,idx)=>{
html+=`<div class="compose-img-grid-item">
<img src="${img.preview}">
<button onclick="removeComposeImage(${idx})"><span class="material-symbols-outlined" style="font-size:16px;">close</span></button>
</div>`;
});
grid.innerHTML=html;
}

function removeComposeImage(idx){
composeImages.splice(idx,1);
renderComposeImageGrid();
checkPostInputs();
}

function removePostImages(){
composeImages=[];
renderComposeImageGrid();
checkPostInputs();
}

// --- Activity/Feeling Functions ---
function openActivityModal() {
    document.getElementById('activity-modal').classList.add('open');
}
function closeActivityModal() {
    document.getElementById('activity-modal').classList.remove('open');
}
function selectActivity(icon, text) {
    currentPostActivity = { icon: icon, text: text };
    closeActivityModal();
    updateTagPreview(); //       
}

async function openTagModal(){
    document.getElementById('tag-modal').classList.add('open');
    const list=document.getElementById('tag-friends-list');
    const friends=currentUserData.friends||[];
    if(friends.length===0){
        list.innerHTML='<div class="empty-feed" style="padding:20px;">No friends to tag</div>';
        return;
    }
    list.innerHTML = '<div class="loading"><span class="material-symbols-outlined">autorenew</span> Loading...</div>';

    const friendDocs = friends.map(fId => db.collection('users').doc(fId).get());
    const snapshots = await Promise.all(friendDocs);

    let html = '';
    snapshots.forEach((snap, index) => {
        if(snap.exists){
            const u=snap.data();
            const fId = friends[index];
            const isTagged=currentTaggedFriends.includes(fId);
            const safeName=escapeHTML(u.name);
            const avHtml=u.avatar?`<img src="${u.avatar}">`:avatarInitial(u.name);
            
            //  onclick   safeName   
            html+=`<div class="msg-item" onclick="toggleTag('${fId}', '${safeName}', this)">
            <div class="avatar">${avHtml}</div>
            <div class="msg-info" style="margin-left:10px;">${safeName}</div>
            <input type="checkbox" ${isTagged?'checked':''} style="pointer-events:none;width:20px;height:20px;accent-color:var(--accent);">
            </div>`;
        }
    });
    list.innerHTML = html || '<div class="empty-feed">No friends found</div>';
}

function toggleTag(uid, name, el){
  const cb=el.querySelector('input');
  if(currentTaggedFriends.includes(uid)){
    currentTaggedFriends=currentTaggedFriends.filter(id=>id!==uid);
    currentTaggedNames=currentTaggedNames.filter(n=>n!==name);
    cb.checked=false;
  }else{
    currentTaggedFriends.push(uid);
    currentTaggedNames.push(name);
    cb.checked=true;
  }
  const tagCount=document.getElementById('tag-count');
  tagCount.style.display=currentTaggedFriends.length>0?'inline-block':'none';
  tagCount.textContent=currentTaggedFriends.length;
  
  // :    
  updateTagPreview();
}


//  :     
function updateTagPreview(){
  const container = document.getElementById('tag-preview-container');
  const list = document.getElementById('tag-preview-list');
  const nameEl = document.getElementById('modal-composer-name'); //  

  if(currentTaggedFriends.length === 0){
    container.classList.remove('show');
    list.innerHTML = '';
    
    //          
if(nameEl && currentUserData) {
   nameEl.innerHTML = `<span style="display:flex; align-items:center; gap:4px;">${escapeHTML(currentUserData.name || 'User')} ${getVerifiedBadge(currentUserData.email, currentUserData.isVerified)}</span>`;
}
return;
  }
  
  container.classList.add('show');
  let html = '';
  
  currentTaggedFriends.forEach((uid, index) => {
    const name = currentTaggedNames[index];
    const safeName = escapeHTML(name);
    html += `
      <div class="tag-chip">
        <span>@${safeName}</span>
        <div class="tag-chip-remove" onclick="removeTagFromPreview('${uid}', '${safeName}')">
          <span class="material-symbols-outlined">close</span>
        </div>
      </div>
    `;
  });
  
  list.innerHTML = html;

  // --- Create Post     ( ) ---
  if(nameEl && currentUserData) {
      const safeName = escapeHTML(currentUserData.name || 'User');
      const vBadge = getVerifiedBadge(currentUserData.email);
      let previewWithText = '';
      
            if(currentTaggedNames.length === 1) {
          previewWithText = `<span style="font-weight:500; color:var(--text-secondary); font-size:14px; margin-left:4px;">is with</span> <strong style="color:var(--text); font-size:14px; margin-left:4px;">${escapeHTML(currentTaggedNames[0])}</strong>`;
      } else if(currentTaggedNames.length === 2) {
          previewWithText = `<span style="font-weight:500; color:var(--text-secondary); font-size:14px; margin-left:4px;">is with</span> <strong style="color:var(--text); font-size:14px; margin-left:4px;">${escapeHTML(currentTaggedNames[0])}</strong> <span style="font-weight:500; color:var(--text-secondary); font-size:14px; margin-left:4px;">and</span> <strong style="color:var(--text); font-size:14px; margin-left:4px;">${escapeHTML(currentTaggedNames[1])}</strong>`;
      } else if(currentTaggedNames.length > 2) {
          previewWithText = `<span style="font-weight:500; color:var(--text-secondary); font-size:14px; margin-left:4px;">is with</span> <strong style="color:var(--text); font-size:14px; margin-left:4px;">${escapeHTML(currentTaggedNames[0])}</strong> <span style="font-weight:500; color:var(--text-secondary); font-size:14px; margin-left:4px;">and</span> <strong style="color:var(--text); font-size:14px; margin-left:4px;">${currentTaggedNames.length - 1} others</strong>`;
      }

      //  Activity Preview 
      let activityText = '';
      if (currentPostActivity) {
          activityText = `<span style="font-weight:500; color:var(--text-secondary); font-size:14px; margin-left:4px;">is ${currentPostActivity.text}</span> <span class="material-symbols-outlined" style="font-size:16px; margin-left:4px; vertical-align:middle; color:var(--accent);">${currentPostActivity.icon}</span>`;
      }
      
      nameEl.innerHTML = `<span style="display:flex; align-items:center; gap:4px;">${safeName} ${vBadge}</span> ${activityText} ${previewWithText}`;
      nameEl.style.flexWrap = 'wrap';
  }
}


//  :      
function removeTagFromPreview(uid, name){
  currentTaggedFriends = currentTaggedFriends.filter(id => id !== uid);
  currentTaggedNames = currentTaggedNames.filter(n => n !== name);
  
  //   
  const tagCount = document.getElementById('tag-count');
  tagCount.style.display = currentTaggedFriends.length > 0 ? 'inline-block' : 'none';
  tagCount.textContent = currentTaggedFriends.length;
  
  //  
  updateTagPreview();
  
  //    
  const modalList = document.getElementById('tag-friends-list');
  if(modalList){
    const items = modalList.querySelectorAll('.msg-item');
    items.forEach(item => {
      const onclickAttr = item.getAttribute('onclick');
      if(onclickAttr && onclickAttr.includes(uid)){
        const cb = item.querySelector('input[type="checkbox"]');
        if(cb) cb.checked = false;
      }
    });
  }
}


function closeTagModal(){document.getElementById('tag-modal').classList.remove('open');}

function openEditPostModal(postId,currentTitle){
closeAllDropdowns();
currentEditPostId=postId;
document.getElementById('edit-post-title-input').value=currentTitle;
document.getElementById('edit-post-modal').classList.add('open');
}

function closeEditPostModal(){
document.getElementById('edit-post-modal').classList.remove('open');
currentEditPostId=null;
}

async function saveEditedPost(){
if(!currentEditPostId)return;
const newTitle=document.getElementById('edit-post-title-input').value.trim();
showToast("Updating post...");
try{
await db.collection('posts').doc(currentEditPostId).update({title:newTitle});
showToast("Post updated!");
closeEditPostModal();
if(document.getElementById('page-profile').classList.contains('active'))loadMyPosts();
}catch(e){showToast("Error updating post.");}
}

async function deletePost(postId){
if(!confirm('Are you sure you want to delete this post?'))return;
closeAllDropdowns();
showToast('Deleting post...');
await db.collection('posts').doc(postId).delete();
showToast('Post deleted!');
if(document.getElementById('page-profile').classList.contains('active'))loadMyPosts();
closeSinglePost();
}
//  FIXED: Single Post View with Working Like & Share Buttons
let singlePostUnsub = null; // -   

async function openSinglePostView(pid) {
    document.getElementById('single-post-screen').classList.add('open');
    const container = document.getElementById('single-post-container');
    container.innerHTML = SKELETON_HTML; 
    
    //      
    if (singlePostUnsub) singlePostUnsub();

    try {
        // -    onSnapshot   
        singlePostUnsub = db.collection('posts').doc(pid).onSnapshot(doc => {
            if (doc.exists) {
                //       ,     
                container.innerHTML = buildPostCardHTML({id: doc.id, ...doc.data()});
            } else {
                container.innerHTML = '<div class="empty-feed">Post not found</div>';
            }
        });
    } catch(e) {
        container.innerHTML = '<div class="empty-feed">Error loading post</div>';
    }
}

//      ,      
function closeSinglePost() {
    document.getElementById('single-post-screen').classList.remove('open');
    if (singlePostUnsub) {
        singlePostUnsub();
        singlePostUnsub = null;
    }
}

async function pinPost(postId){
closeAllDropdowns();
try{
const ref=db.collection('posts').doc(postId);
const doc=await ref.get();
if(doc.exists){
const isPinned=doc.data().isPinned||false;
await ref.update({isPinned:!isPinned});
showToast(isPinned?'Post unpinned':'Post pinned!');
loadMyPosts();
}
}catch(e){showToast('Failed to pin post');}
}

async function submitPost(){
const title=document.getElementById('post-title').value.trim();
if(!title&&composeImages.length===0)return;
if(!checkRateLimit()) return;

let imgUrls=[];
if(composeImages.length>0){
showToast('Uploading images...');
try{
for(let i=0;i<composeImages.length;i++){
const url=await uploadToCloudinary(composeImages[i].file,false);
imgUrls.push(url);
}
}catch(e){showToast('Image upload failed!');return;}
}
    try{
        const expireAt=new Date(Date.now()+ONE_YEAR_MS);
                const newPostRef = await db.collection('posts').add({
            uid:currentUser.uid,
            bgColor: currentPostBgColor,
            name:currentUserData.name||currentUser.email.split('@')[0],
            email:currentUserData.email||'',
            isVerified: currentUserData.isVerified || false,
            avatar:currentUserData.avatar||'',
            title:title,
            imgUrls:imgUrls,
            imgUrl:imgUrls[0]||'',
            likes:0,
            likedBy:[],
            comments:[],
            tagged:currentTaggedFriends,
            taggedNames: currentTaggedNames,
            activity: currentPostActivity, /* <--       */
            isPinned:false,
            createdAt:firebase.firestore.FieldValue.serverTimestamp(),
            expiresAt:expireAt
        });

        // :      
        if (currentTaggedFriends && currentTaggedFriends.length > 0) {
            currentTaggedFriends.forEach(taggedUid => {
                if (taggedUid !== currentUser.uid) { //       
                    db.collection('notifications').add({
                        toUid: taggedUid,
                        fromUid: currentUser.uid,
                        fromName: currentUserData.name || 'User',
                        type: 'tag', //   
                        postId: newPostRef.id, //       
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
    }catch(e){showToast('Error saving post.');}
}

// ==========================================
//  ULTIMATE GRID VIEW & JUMP SCROLLING FIXED 
// ==========================================
function loadFeed() {
    const feedList = document.getElementById('feed-list');
    if (!feedList) return;

    if (feedUnsub) feedUnsub();

    feedUnsub = db.collection('posts').orderBy('createdAt', 'desc').limit(postLimit).onSnapshot((snap) => {
        const loadEl = document.getElementById('feed-loading');
        if (loadEl) loadEl.style.display = 'none';

        let postsData = [];
        snap.forEach(d => {
            postsData.push({ id: d.id, ...d.data() });
        });

        const mutedList = currentUserData?.mutedFeedUsers || [];
        postsData = postsData.filter(p => !mutedList.includes(p.uid));

        if (currentFeedTab === 'following') { 
            postsData = postsData.filter(p => currentUserData?.following?.includes(p.uid) || p.uid === currentUser?.uid);
        }

        //  :           
        const isGrid = currentUserData && currentUserData.feedViewMode === 'grid';
        let actualContainer = feedList.querySelector('#feed-actual-container');
        
        if (!actualContainer) {
            feedList.innerHTML = `<div id="feed-actual-container" class="${isGrid ? 'grid-feed-container' : 'list-feed-container'}"></div>`;
            actualContainer = feedList.querySelector('#feed-actual-container');
        } else {
            //     ,     
            const currentlyGrid = actualContainer.classList.contains('grid-feed-container');
            if (isGrid && !currentlyGrid) {
                actualContainer.className = 'grid-feed-container';
                actualContainer.innerHTML = ''; 
            } else if (!isGrid && currentlyGrid) {
                actualContainer.className = 'list-feed-container';
                actualContainer.innerHTML = ''; 
            }
        }

        //    (      )
        if (postsData.length === 0) {
            if (actualContainer.children.length === 0) {
                actualContainer.innerHTML = '<div class="empty-feed"><span class="material-symbols-outlined">inbox</span><br>No posts yet in this feed</div>';
            }
            const loadMoreBtn = document.getElementById('load-more-btn');
            if (loadMoreBtn) loadMoreBtn.style.display = 'none';
            return;
        }

        //  'empty-feed'  ,   
        const emptyMsg = actualContainer.querySelector('.empty-feed');
        if (emptyMsg) emptyMsg.remove();

        const fetchedPostIds = postsData.map(p => p.id);

        //     
        Array.from(actualContainer.children).forEach(child => {
            const childId = child.getAttribute('data-post-id');
            if (childId && !fetchedPostIds.includes(childId)) {
                child.remove();
            }
        });

        //   :    
        postsData.forEach((p, index) => {
            let existingCard = actualContainer.querySelector(`[data-post-id="${p.id}"]`);
            
            if (existingCard) {
                //     ,        (- !)
                const expectedSibling = actualContainer.children[index];
                if (existingCard !== expectedSibling) {
                    actualContainer.insertBefore(existingCard, expectedSibling);
                }
                
                //      
                if (!isGrid) {
                    const likeCountEl = existingCard.querySelector('.post-action-btn:nth-child(1) span');
                    const commentCountEl = existingCard.querySelector('.post-action-btn:nth-child(2) span');
                    const likeIcon = existingCard.querySelector('.post-action-btn:nth-child(1) i');
                    const likeBtn = existingCard.querySelector('.post-action-btn:nth-child(1)');
                    
                    if (likeCountEl) likeCountEl.textContent = p.likes || 0;
                    if (commentCountEl) commentCountEl.textContent = p.comments ? p.comments.length : 0;
                    
                    if (p.likedBy && p.likedBy.includes(currentUser?.uid)) {
                        likeBtn.classList.add('liked');
                        likeIcon.className = 'ph-fill ph-heart';
                    } else {
                        likeBtn.classList.remove('liked');
                        likeIcon.className = 'ph-bold ph-heart';
                    }
                } else {
                    const likeCountEl = existingCard.querySelector('.grid-post-overlay > div:nth-child(2)');
                    if(likeCountEl) {
                        likeCountEl.innerHTML = `<i class="${p.likedBy && p.likedBy.includes(currentUser?.uid) ? 'ph-fill' : 'ph-bold'} ph-heart" style="font-size:15px; ${p.likedBy && p.likedBy.includes(currentUser?.uid) ? 'color:var(--danger);' : ''}"></i> ${p.likes || 0}`;
                    }
                }
            } else {
                //     
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = isGrid ? buildGridPostCardHTML(p) : buildPostCardHTML(p);
                const newElement = tempDiv.firstElementChild;
                newElement.setAttribute('data-post-id', p.id);
                
                const referenceNode = actualContainer.children[index];
                if (referenceNode) {
                    actualContainer.insertBefore(newElement, referenceNode);
                } else {
                    actualContainer.appendChild(newElement);
                }
            }
        });

        //   
        const loadMoreBtn = document.getElementById('load-more-btn');
        if (loadMoreBtn) {
            loadMoreBtn.style.display = postsData.length >= postLimit ? 'block' : 'none';
        }
    });
}

// ==========================================
//  INFINITE SCROLLING SYSTEM
// ==========================================
let isLoadingMore = false;

function loadMorePosts() {
    if (isLoadingMore) return;
    isLoadingMore = true;
    
    postLimit += 10;
    loadFeed();
    
    setTimeout(() => {
        isLoadingMore = false;
    }, 1500);
}

//       
function initInfiniteScroll() {
    window.addEventListener('scroll', () => {
        //        (   ) 
        if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 250) {
            //    active    
            const feedPage = document.getElementById('page-feed');
            if (feedPage && feedPage.classList.contains('active')) {
                loadMorePosts();
            }
        }
    });
}

//          
document.addEventListener('DOMContentLoaded', () => {
    initInfiniteScroll();
});

function setFeedTab(tab){
currentFeedTab=tab;
postLimit = 10;
document.querySelectorAll('.feed-tab').forEach(t=>t.classList.remove('active'));
const tabEl=document.getElementById('tab-'+tab);
if(tabEl)tabEl.classList.add('active');
loadFeed();
}

function openImageZoom(src){
document.getElementById('zoom-image').src=src;
document.getElementById('image-zoom-modal').classList.add('open');
}

function closeImageZoom(){
    document.getElementById('image-zoom-modal').classList.remove('open');
    document.getElementById('zoom-image').src='';
    // -       
    const menu = document.getElementById('zoom-menu');
    if(menu) menu.classList.remove('open');
}

//  :     (APK  Web   )
async function downloadZoomedImage(event) {
    if(event) event.stopPropagation();
    
    //   
    const menu = document.getElementById('zoom-menu');
    if(menu) menu.classList.remove('open');
    
    let imgUrl = document.getElementById('zoom-image').src;
    if(!imgUrl) return;

    showToast("Starting download...");

    // APK (WebView) : Cloudinary-  fl_attachment  
    //        ,      
    if (imgUrl.includes('cloudinary.com')) {
        if (!imgUrl.includes('fl_attachment')) {
            imgUrl = imgUrl.replace('/upload/', '/upload/fl_attachment:GoChat_Photo/');
        }
        // WebView-      
        window.location.href = imgUrl;
        return;
    }

    // Cloudinary         (Blob)  
    try {
        const response = await fetch(imgUrl);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = blobUrl;
        a.download = 'GoChat_Image_' + Date.now() + '.jpg';
        document.body.appendChild(a);
        a.click();
        
        window.URL.revokeObjectURL(blobUrl);
        document.body.removeChild(a);
    } catch (e) {
        //         
        window.open(imgUrl, '_blank');
    }
}


function togglePostDropdown(dropId){
const dropdown = document.getElementById(dropId);
if(!dropdown) return;
const isOpen = dropdown.classList.contains('open');
closeAllDropdowns();
if(!isOpen) {
dropdown.classList.add('open');
}
}

function buildPostCardHTML(p){
const pid=p.id;
const uniqueDropId = pid + '_' + Math.random().toString(36).substr(2, 5);
const av=p.avatar?`<img src="${p.avatar}">`:avatarInitial(p.name||'?');
const vBadge=getVerifiedBadge(p.email, p.isVerified);
const isLiked=p.likedBy&&p.likedBy.includes(currentUser?.uid);
const likeColor=isLiked?'var(--danger)':'var(--text-secondary)';
const fillProp=isLiked?'1':'0';
const commentCount=p.comments?p.comments.length:0;
const safeName=escapeHTML(p.name||'User');
const safeTitle=escapeHTML(p.title||'');
const safeTitleForAttr=(p.title||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;');

// ---  : "is with..."    () ---
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

// : Activity/Feeling Render
let activityHtml = '';
if (p.activity) {
    activityHtml = `<span style="font-weight:500; color:var(--text-secondary); font-size:14px; margin-left:4px;">is ${escapeHTML(p.activity.text)}</span> <span class="material-symbols-outlined" style="font-size:16px; margin-left:4px; vertical-align:middle; color:var(--accent);">${escapeHTML(p.activity.icon)}</span>`;
}
// ---------------------------------------------

const imgUrls=p.imgUrls&&p.imgUrls.length>0?p.imgUrls:(p.imgUrl?[p.imgUrl]:[]);
let mediaHtml='';
if(imgUrls.length>1){
let slides=imgUrls.map(url=>{
const safeUrl = escapeHTML(url);
return`<div style="min-width:100%;"><img class="post-img" src="${safeUrl}" onclick="event.stopPropagation();openImageZoom('${safeUrl}')" style="margin-bottom:0;"></div>`;
}).join('');
mediaHtml=`<div class="post-media-wrap" ondblclick="event.stopPropagation(); handleDoubleTap('${pid}',event)">
<div style="display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;">
${slides}
</div>
<i class="ph-fill ph-heart double-tap-heart"></i>
</div>`;
}else if(imgUrls.length===1){
const safeUrl = escapeHTML(imgUrls[0]);
mediaHtml=`<div class="post-media-wrap" ondblclick="event.stopPropagation(); handleDoubleTap('${pid}',event)">
<img class="post-img" src="${safeUrl}" onclick="event.stopPropagation();openImageZoom('${safeUrl}')">
<span class="material-symbols-outlined double-tap-heart filled" style="font-variation-settings:'FILL' 1;">favorite</span>
</div>`;
}

let postDropdownHtml = `<div style="position:relative;margin-left:auto;">
<i class="ph-bold ph-dots-three-vertical more-btn" onclick="event.stopPropagation();togglePostDropdown('post-drop-${uniqueDropId}')" style="cursor:pointer;padding:6px;border-radius:50%;color:var(--text-secondary);font-size:24px;"></i>
<div id="post-drop-${uniqueDropId}" class="post-dropdown-menu" onclick="event.stopPropagation();">`;

if(p.uid === currentUser?.uid){
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

    //     
    const isMePost = (p.uid === currentUser?.uid);
    const isAlreadyFollowing = currentUserData?.following?.includes(p.uid);
    let quickFollowBtn = '';
    
    //            ,    
    if (!isMePost && !isAlreadyFollowing) {
        quickFollowBtn = `<span onclick="event.stopPropagation(); toggleFollow('${p.uid}'); this.style.display='none';" style="color: var(--accent); font-size: 12px; font-weight: 700; cursor: pointer; margin-left: 8px; padding: 2px 10px; background: var(--surface-2); border-radius: 12px; border: 1px solid var(--accent); transition: all 0.2s;">Follow</span>`;
    }

    //  Check if the post author is verified to apply premium class
    const premiumPostClass = p.isVerified ? 'verified-premium-post' : '';

//    onclick   
return`<div class="post-card ${premiumPostClass}" style="cursor:pointer;" onclick="openSinglePostView('${pid}')">
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
<!--   event.stopPropagation()   -->
<button class="post-action-btn ${isLiked ? 'liked' : ''}" onclick="event.stopPropagation(); toggleLike('${pid}')">
<i class="${isLiked ? 'ph-fill' : 'ph-bold'} ph-heart" style="font-size:24px;"></i>
<span style="font-size:14px;">${p.likes || 0}</span>
</button>

<button class="post-action-btn" onclick="event.stopPropagation(); openCommentPanel('${pid}')">
<i class="ph-bold ph-chat-circle" style="font-size:24px;"></i>
<span style="font-size:14px;">${commentCount}</span>
</button>
<!--     (  ) -->
<button class="post-action-btn" onclick="event.stopPropagation(); openShareModal('${pid}', '${safeTitleForAttr}', '${imgUrls[0] || ''}')">
<i class="ph-bold ph-share-network" style="font-size:24px;"></i>
<span style="font-size:14px;">${p.shares || 0}</span>
</button>
</div>
</div>`;
}

function closeSinglePost(){document.getElementById('single-post-screen').classList.remove('open');}

//     (  + )
async function loadMyPosts(){
    const list=document.getElementById('my-posts-list');
    if(!list)return;
    list.innerHTML = SKELETON_HTML; // Skeleton Loading Effect
    try{
        const snap=await db.collection('posts').where('uid','==',currentUser.uid).get();
        let mine=[];
        snap.forEach(d=>{mine.push({id:d.id,...d.data()});});
        mine.sort((a,b)=>{
            if(a.isPinned&&!b.isPinned)return-1;
            if(!a.isPinned&&b.isPinned)return 1;
            const ta=a.createdAt?.toMillis?a.createdAt.toMillis():0;
            const tb=b.createdAt?.toMillis?b.createdAt.toMillis():0;
            return tb-ta;
        });
        if(mine.length===0){list.innerHTML='<div class="empty-feed">No posts yet</div>';return;}
        
        //   
        let html = '<div class="profile-photo-grid">';
        mine.forEach(p => {
            const imgUrls = p.imgUrls && p.imgUrls.length > 0 ? p.imgUrls : (p.imgUrl ? [p.imgUrl] : []);
            let media = '';
            let multiIcon = imgUrls.length > 1 ? `<span class="material-symbols-outlined grid-multi-icon">content_copy</span>` : '';
            let pinIcon = p.isPinned ? `<span class="material-symbols-outlined grid-pin-icon">push_pin</span>` : '';
            
            if(imgUrls.length > 0){
                media = `<img src="${escapeHTML(imgUrls[0])}">`;
            } else {
                media = `<div class="grid-post-text">${escapeHTML(p.title || '')}</div>`;
            }
            html += `<div class="grid-post-item" onclick="openSinglePostView('${p.id}')">${media}${multiIcon}${pinIcon}</div>`;
        });
        html += '</div>';
        list.innerHTML = html;
    }catch(e){list.innerHTML='<div class="empty-feed">Network issue. Could not load posts.</div>';}
}

//      (  + )
async function loadOtherUserPosts(uid){
    const list=document.getElementById('other-user-posts-list');
    if(!list)return;
    list.innerHTML = SKELETON_HTML; // Skeleton Loading Effect
    try{
        const snap=await db.collection('posts').where('uid','==',uid).get();
        let posts=[];
        snap.forEach(d=>{posts.push({id:d.id,...d.data()});});
        posts.sort((a,b)=>{
            const ta=a.createdAt?.toMillis?a.createdAt.toMillis():0;
            const tb=b.createdAt?.toMillis?b.createdAt.toMillis():0;
            return tb-ta;
        });
        if(posts.length===0){list.innerHTML='<div class="empty-feed">No posts yet</div>';return;}
        
        //   
        let html = '<div class="profile-photo-grid">';
        posts.forEach(p => {
            const imgUrls = p.imgUrls && p.imgUrls.length > 0 ? p.imgUrls : (p.imgUrl ? [p.imgUrl] : []);
            let media = '';
            let multiIcon = imgUrls.length > 1 ? `<span class="material-symbols-outlined grid-multi-icon">content_copy</span>` : '';
            
            if(imgUrls.length > 0){
                media = `<img src="${escapeHTML(imgUrls[0])}">`;
            } else {
                media = `<div class="grid-post-text">${escapeHTML(p.title || '')}</div>`;
            }
            html += `<div class="grid-post-item" onclick="openSinglePostView('${p.id}')">${media}${multiIcon}</div>`;
        });
        html += '</div>';
        list.innerHTML = html;
    }catch(e){list.innerHTML='<div class="empty-feed">Failed to load posts.</div>';}
}

function loadUserUI(){
    if(!currentUser||!currentUserData) return;
    
    const name = currentUserData.name || currentUser.email.split('@')[0] || 'User';
    const avHtml = currentUserData.avatar ? `<img src="${currentUserData.avatar}">` : avatarInitial(name);
    const safeName = escapeHTML(name);
    const verifiedBadge = getVerifiedBadge(currentUser.email, currentUserData.isVerified);
    
    // --- :     ---
    const nameHtml = `
        <div style="display: flex; align-items: center; flex-wrap: nowrap; gap: 4px;">
            <span style="white-space: nowrap;">${safeName}</span>
            <span style="display: flex; align-items: center; flex-shrink: 0;">${verifiedBadge}</span>
        </div>
    `;
    
    const setSafeHTML=(id,html)=>{const el=document.getElementById(id);if(el)el.innerHTML=html;};
    setSafeHTML('modal-composer-avatar', avHtml);
    setSafeHTML('modal-composer-name', safeName + verifiedBadge); //    
    setSafeHTML('profile-name-display', nameHtml); //     
    setSafeHTML('profile-avatar-big', avHtml);
        //      
    const usernameDisplay = document.getElementById('profile-username-display');
    if (usernameDisplay) {
        if (currentUserData.username) {
            usernameDisplay.style.display = 'block';
            usernameDisplay.textContent = '@' + currentUserData.username;
        } else {
            usernameDisplay.style.display = 'none';
        }
    }

    
       //        
    const navPicContainer = document.getElementById('nav-profile-pic-container');
    if (navPicContainer) {
        if (currentUserData.avatar) {
            navPicContainer.innerHTML = `<img src="${currentUserData.avatar}" style="width: 100%; height: 100%; object-fit: cover;">`;
        } else {
            navPicContainer.innerHTML = `<i class="ph ph-user" style="font-size: 18px; color: var(--text-muted);"></i>`;
        }
    }

    const bioEl=document.getElementById('profile-bio-display');
    if(bioEl)bioEl.textContent=currentUserData.bio||'';
    
        let dHtml='';
    if(currentUserData.relationship)dHtml+=`<div class="detail-item"><i class="ph-bold ph-heart" style="font-size:20px; color:var(--accent-dark);"></i> <strong>${escapeHTML(currentUserData.relationship)}</strong></div>`;
    if(currentUserData.gender)dHtml+=`<div class="detail-item"><i class="ph-bold ph-user" style="font-size:20px; color:var(--accent-dark);"></i> <strong>${escapeHTML(currentUserData.gender)}</strong></div>`;
    if(currentUserData.location)dHtml+=`<div class="detail-item"><i class="ph-bold ph-map-pin" style="font-size:20px; color:var(--accent-dark);"></i> Lives in <strong>${escapeHTML(currentUserData.location)}</strong></div>`;
    if(currentUserData.hometown)dHtml+=`<div class="detail-item"><i class="ph-bold ph-house" style="font-size:20px; color:var(--accent-dark);"></i> From <strong>${escapeHTML(currentUserData.hometown)}</strong></div>`;
    if(currentUserData.phone) dHtml += `<div class="detail-item"><i class="ph-bold ph-phone" style="font-size:20px; color:var(--accent-dark);"></i> <strong>${escapeHTML(currentUserData.phone)}</strong></div>`;
    if(currentUserData.email) dHtml += `<div class="detail-item"><i class="ph-bold ph-envelope-simple" style="font-size:20px; color:var(--accent-dark);"></i> <strong>${escapeHTML(currentUserData.email)}</strong></div>`;
    if(currentUserData.profession) dHtml += `<div class="detail-item"><i class="ph-bold ph-briefcase" style="font-size:20px; color:var(--accent-dark);"></i> <strong>${escapeHTML(currentUserData.profession)}</strong></div>`;
    if (currentUserData.createdAt) {
        const joinedDate = currentUserData.createdAt.toDate ? currentUserData.createdAt.toDate() : new Date(currentUserData.createdAt);
        const month = joinedDate.toLocaleString('default', { month: 'long' });
        const year = joinedDate.getFullYear();
        dHtml += `<div class="detail-item"><i class="ph-bold ph-clock" style="font-size:20px; color:var(--accent-dark);"></i> Joined <strong>${month} ${year}</strong></div>`;
    }
    setSafeHTML('profile-details-display', dHtml); /*     */
    
    const followersCount = document.getElementById('my-followers-count');
    const followingCount = document.getElementById('my-following-count');
    if(followersCount) followersCount.textContent = (currentUserData.followers || []).length;
    if(followingCount) followingCount.textContent = (currentUserData.following || []).length;
    
        //     Premium Check (Without Badge) 
    const myProfileHeader = document.querySelector('#page-profile .profile-header');
    
    if (currentUserData.isVerified) {
        myProfileHeader.classList.add('verified-premium');
    } else {
        myProfileHeader.classList.remove('verified-premium');
    }
}

async function loadMyPosts(){
const list=document.getElementById('my-posts-list');
if(!list)return;
list.innerHTML='<div class="loading"><span class="material-symbols-outlined">autorenew</span> Loading...</div>';
try{
const snap=await db.collection('posts').where('uid','==',currentUser.uid).get();
let mine=[];
snap.forEach(d=>{mine.push({id:d.id,...d.data()});});
mine.sort((a,b)=>{
if(a.isPinned&&!b.isPinned)return-1;
if(!a.isPinned&&b.isPinned)return 1;
const ta=a.createdAt?.toMillis?a.createdAt.toMillis():0;
const tb=b.createdAt?.toMillis?b.createdAt.toMillis():0;
return tb-ta;
});
if(mine.length===0){list.innerHTML='<div class="empty-feed">No posts yet</div>';return;}
list.innerHTML=mine.map(p=>buildPostCardHTML(p)).join('');
}catch(e){list.innerHTML='<div class="empty-feed">Network issue. Could not load posts.</div>';}
}

function uploadAvatar(input){
const file=input.files[0];
if(!file)return;
if(file.size > MAX_FILE_SIZE) {
showToast('Profile photo must be under 5MB!');
return;
}
showToast('Uploading profile photo...');
uploadToCloudinary(file,false)
.then(async url=>{
await db.collection('users').doc(currentUser.uid).update({avatar:url});
currentUserData.avatar=url;
        // ===  :        ===
        try {
            // 'posts'         
            const postsSnapshot = await db.collection('posts').where('uid', '==', currentUser.uid).get();
            
            if (!postsSnapshot.empty) {
                const batch = db.batch();
                postsSnapshot.forEach((doc) => {
                    batch.update(doc.ref, { avatar: url }); 
                    // (:        'avatar'     ,   )
                });
                await batch.commit(); //       !
            }
        } catch (error) {
            console.error("Error updating old posts avatar: ", error);
        }
        // ========================================================
loadUserUI();
showToast('Profile photo updated!');
})
.catch(e=>showToast('Network error.'));
}

async function cleanupExpiredPosts(){
const now = new Date();
try {
const expiredPosts = await db.collection('posts').where('expiresAt', '<', now).get();
const batch = db.batch();
expiredPosts.forEach(d => batch.delete(d.ref));
if (!expiredPosts.empty) await batch.commit();

const expiredStories = await db.collection('stories').where('expiresAt', '<', now).get();
const storyBatch = db.batch();
expiredStories.forEach(d => storyBatch.delete(d.ref));
if (!expiredStories.empty) await storyBatch.commit();
} catch(e) {
console.log('Cleanup error:', e);
}
}

setInterval(cleanupExpiredPosts, 30 * 60 * 1000);

document.addEventListener('DOMContentLoaded', () => {
const chatInput = document.getElementById('chat-input');
if (chatInput) {
chatInput.addEventListener('input', () => {
setTypingStatus(true);
});
}
});

// Initialize theme
if(localStorage.getItem('theme')==='light'){
  document.body.classList.add('light-mode');
}

// Close comment panel function
function closeCommentPanel(){
document.getElementById('comment-panel').classList.remove('open');
if(commentPanelListener)commentPanelListener();
activeCommentPostId=null;
}

// Comment panel send button listener
document.getElementById('comment-panel-send-btn').addEventListener('click',async()=>{
const inp=document.getElementById('comment-panel-input');
const txt=inp.value.trim();
if(!txt||!activeCommentPostId)return;
inp.value='';
const ref=db.collection('posts').doc(activeCommentPostId);
const doc=await ref.get();
if(doc.exists){
let comments=doc.data().comments||[];
comments.push({uid:currentUser.uid,name:currentUserData.name,text:txt,time:Date.now()});
await ref.update({comments});
if(doc.data().uid!==currentUser.uid){
db.collection('notifications').add({
toUid:doc.data().uid,fromUid:currentUser.uid,
fromName:currentUserData.name,
type:'comment',postId:activeCommentPostId,read:false,
createdAt:firebase.firestore.FieldValue.serverTimestamp()
});
awardPoints(doc.data().uid, 10);
}
}
});

// Reply to comment with inline input
async function replyToComment(pid,idx){
const txt=prompt("Write your reply:");
if(!txt||!txt.trim())return;
const ref=db.collection('posts').doc(pid);
const doc=await ref.get();
let comments=doc.data().comments||[];
if(!comments[idx].replies)comments[idx].replies=[];
comments[idx].replies.push({uid:currentUser.uid,name:currentUserData.name,text:txt.trim(),time:Date.now()});
await ref.update({comments});
if(doc.data().uid !== currentUser.uid) {
awardPoints(doc.data().uid, 10);
}
}
// ===== BLOCKED ACCOUNTS SETTINGS LOGIC =====

//     
async function loadBlockedUsers() {
  const list = document.getElementById('blocked-users-list');
  if (!list) return;
  
  const blocked = currentUserData.blockedUsers || [];
  if (blocked.length === 0) {
    list.innerHTML = '<div style="font-size:13px; color:var(--text-muted); text-align:center; padding:10px;">No blocked users</div>';
    return;
  }
  
  list.innerHTML = '<div class="loading" style="font-size:13px; padding:10px;"><span class="material-symbols-outlined" style="font-size:16px;">autorenew</span> Loading...</div>';
  
  try {
    const blockedDocs = blocked.map(uid => db.collection('users').doc(uid).get());
    const snapshots = await Promise.all(blockedDocs);
    
    let html = '';
    snapshots.forEach((doc, index) => {
      if (doc.exists) {
        const u = doc.data();
        const safeName = escapeHTML(u.name);
        const avHtml = u.avatar ? `<img src="${u.avatar}">` : avatarInitial(u.name);
        const uid = blocked[index];
        
        //    ,    
        html += `<div class="msg-item" style="margin:0; padding:10px; border-radius:12px; border:1px solid var(--border);">
          <div class="avatar sm">${avHtml}</div>
          <div class="msg-info" style="margin-left:10px;">
            <div class="msg-name" style="font-size:14px;">${safeName}</div>
          </div>
          <button class="btn-outline" style="padding:6px 12px; font-size:11px; margin:0; border-color:var(--success); color:var(--success);" onclick="unblockUserFromList('${uid}')">Unblock</button>
        </div>`;
      }
    });
    list.innerHTML = html || '<div style="font-size:13px; color:var(--text-muted); text-align:center;">No blocked users found</div>';
  } catch (e) {
    list.innerHTML = '<div style="font-size:13px; color:var(--danger); text-align:center;">Failed to load</div>';
  }
}

//      
async function unblockUserFromList(uid) {
  if(!confirm("Are you sure you want to unblock this user?")) return;
  
  //     
  await db.collection('users').doc(currentUser.uid).update({
    blockedUsers: firebase.firestore.FieldValue.arrayRemove(uid)
  });
  
  //    
  currentUserData.blockedUsers = currentUserData.blockedUsers.filter(id => id !== uid);
  
  showToast('User Unblocked Successfully!');
  
  //           
  loadBlockedUsers(); 
}

// --- Scroll to Hide Navigation Logic (Isolated & Safe) ---
(function() {
    let safeLastScroll = 0;
    const safeTopBar = document.querySelector('.topbar');
    const safeBottomNav = document.querySelector('.bottom-nav');

    if (safeTopBar && safeBottomNav) {
        window.addEventListener('scroll', function() {
            let currentScroll = window.pageYOffset || document.documentElement.scrollTop;

            if (currentScroll <= 50) {
                safeTopBar.classList.remove('nav-hidden-top');
                safeBottomNav.classList.remove('nav-hidden-bottom');
                safeLastScroll = currentScroll;
                return;
            }

            if (currentScroll > safeLastScroll) {
                safeTopBar.classList.add('nav-hidden-top');
                safeBottomNav.classList.add('nav-hidden-bottom');
            } else {
                safeTopBar.classList.remove('nav-hidden-top');
                safeBottomNav.classList.remove('nav-hidden-bottom');
            }
            
            safeLastScroll = currentScroll;
        });
    }
})();
//    /  
function toggleChatDeleteMenu() {
    const menu = document.getElementById('chat-delete-menu');
    if (menu.style.display === 'block') {
        menu.style.display = 'none';
    } else {
        menu.style.display = 'block';
    }
}

//         
document.addEventListener('click', function(event) {
    const menu = document.getElementById('chat-delete-menu');
    const actionsDiv = document.querySelector('.chat-header-actions');
    if (menu && menu.style.display === 'block' && actionsDiv && !actionsDiv.contains(event.target)) {
        menu.style.display = 'none';
    }
});
// Delete for Everyone   
async function deleteChatForEveryone() {
    //      
    document.getElementById('chat-delete-menu').style.display = 'none';

    //    
    const confirmDelete = confirm("Are you sure? This will permanently delete all messages for both sides and cannot be undone.");
    if (!confirmDelete) return;

    try {
        if (!currentChatId) {
            alert("Error: Chat ID not found!");
            return;
        }

        // .         
        const chatMessagesDiv = document.getElementById('chat-messages');
        if (chatMessagesDiv) {
            chatMessagesDiv.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">All messages deleted.</div>';
        }

        // . - (messages)      
        const messagesRef = db.collection('chats').doc(currentChatId).collection('messages');
        const messagesSnapshot = await messagesRef.get();
        
        // .        (batch)  
        const batch = db.batch();
        messagesSnapshot.forEach((doc) => {
            batch.delete(doc.ref);
        });
        await batch.commit(); //    

        // .    (last message )  
        await db.collection('chats').doc(currentChatId).delete();
        
        alert("Chat deleted for everyone successfully! Storage freed.");
        
        //     
        if (typeof closeChat === 'function') {
            closeChat();
        }
        
    } catch (error) {
        console.error("Error deleting chat:", error);
        alert("Failed to delete chat. Please try again.");
    }
}
// ===== Password Visibility Toggle =====
function togglePasswordVisibility() {
    //   auth-password    
    const passwordInput = document.getElementById('auth-password');
    const eyeIcon = document.getElementById('toggle-eye');

    if (passwordInput.type === 'password') {
        passwordInput.type = 'text'; //  
        eyeIcon.innerText = 'visibility_off'; //   
    } else {
        passwordInput.type = 'password'; //    
        eyeIcon.innerText = 'visibility'; //    
    }
}
// ===== GROUP CHAT LOGIC (STEP 2: Create & Load Friends) =====
let selectedGroupFriends = [];

async function openCreateGroupModal() {
    document.getElementById('create-group-modal').style.display = 'flex';
    selectedGroupFriends = []; //      
    document.getElementById('group-name-input').value = ''; //   
    await loadFriendsForGroup(); //    
}

function closeCreateGroupModal() {
    document.getElementById('create-group-modal').style.display = 'none';
}

async function loadFriendsForGroup() {
    const list = document.getElementById('group-friends-list');
    const friends = currentUserData.friends || [];

    if (friends.length === 0) {
        list.innerHTML = '<div style="text-align:center; color:var(--text-muted); font-size:13px; margin-top:20px;">You have no friends to add.</div>';
        return;
    }

    list.innerHTML = '<div class="loading" style="text-align:center; padding: 20px;"><span class="material-symbols-outlined">autorenew</span> Loading friends...</div>';

    try {
        const friendDocs = friends.map(uid => db.collection('users').doc(uid).get());
        const snapshots = await Promise.all(friendDocs);
        
        let html = '';
        snapshots.forEach((doc, index) => {
            if (doc.exists) {
                const u = doc.data();
                const uid = friends[index];
                const safeName = escapeHTML(u.name);
                const avHtml = u.avatar ? `<img src="${u.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:var(--gradient);color:#fff;font-weight:bold;">${safeName[0].toUpperCase()}</div>`;
                
                //      -
                html += `
                <div class="msg-item" onclick="toggleGroupFriend('${uid}', this)" style="margin: 0; padding: 10px; cursor: pointer; border-radius: 8px;">
                    <div class="avatar sm">${avHtml}</div>
                    <div class="msg-info" style="margin-left:10px;">${safeName}</div>
                    <input type="checkbox" value="${uid}" style="pointer-events:none; width:18px; height:18px; accent-color: #8a2be2;">
                </div>`;
            }
        });
        list.innerHTML = html;
    } catch (error) {
        list.innerHTML = '<div style="text-align:center; color:var(--danger); font-size:13px;">Failed to load friends.</div>';
    }
}

function toggleGroupFriend(uid, element) {
    const checkbox = element.querySelector('input[type="checkbox"]');
    if (selectedGroupFriends.includes(uid)) {
        selectedGroupFriends = selectedGroupFriends.filter(id => id !== uid);
        checkbox.checked = false; //   
    } else {
        selectedGroupFriends.push(uid);
        checkbox.checked = true; //  
    }
}

async function createGroupAction() {
    const groupName = document.getElementById('group-name-input').value.trim();
    
    if (!groupName) {
        showToast("Please enter a group name!");
        return;
    }
    if (selectedGroupFriends.length === 0) {
        showToast("Please select at least one friend!");
        return;
    }

    const btn = document.querySelector('#create-group-modal button');
    const originalText = btn.textContent;
    btn.textContent = "Creating Group...";
    btn.disabled = true; //   

    try {
        const groupId = 'group_' + Date.now(); //    
        const members = [currentUser.uid, ...selectedGroupFriends]; //  +  
        
        //    
        await db.collection('chats').doc(groupId).set({
            isGroup: true,
            groupName: groupName,
            admin: currentUser.uid,
            members: members,
            lastMsg: 'Group created',
            lastAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        showToast("Group created successfully! ");
        closeCreateGroupModal();
        
        // ,      !       
        setTimeout(() => {
            showToast("Ready for Step 3 to show the group in message list!");
        }, 2000);

    } catch (error) {
        console.error(error);
        showToast("Failed to create group.");
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

// ===== MESSAGE SELECTION, SWIPE TO REPLY & DELETE LOGIC =====
let selectedMsgIds = [];
let isMsgSelectionMode = false;
let msgPressTimer = null;
let touchStartX = 0;
let touchStartY = 0;
let isSwiping = false;

function handleMsgTouchStart(msgId, event) {
    if(isMsgSelectionMode) return;
    if(event && event.touches) {
        touchStartX = event.touches[0].clientX;
        touchStartY = event.touches[0].clientY;
    }
    isSwiping = false;
    msgPressTimer = setTimeout(() => {
        if(!isSwiping) enterSelectionMode(msgId);
    }, 500);
}

function handleMsgTouchMove(event) {
    if(isMsgSelectionMode) return;
    if(event && event.touches) {
        let currentX = event.touches[0].clientX;
        let currentY = event.touches[0].clientY;
        
        //       ,    (Long Press)  
        if(Math.abs(currentX - touchStartX) > 15 || Math.abs(currentY - touchStartY) > 15) {
            isSwiping = true;
            if(msgPressTimer) clearTimeout(msgPressTimer);
        }
        
        //      (   )
        if(currentX - touchStartX > 20 && Math.abs(currentY - touchStartY) < 30) {
           let moveX = Math.min(currentX - touchStartX, 80); //    
           event.currentTarget.style.transform = `translateX(${moveX}px)`;
        }
    }
}

function handleMsgTouchEnd(msgId, event) {
    if(msgPressTimer) clearTimeout(msgPressTimer);
    
    //      ( )
    if(event && event.currentTarget) {
        event.currentTarget.style.transform = 'translateX(0)';
    }

    if(isMsgSelectionMode) return;
    if(event && event.changedTouches && touchStartX > 0) {
        let touchEndX = event.changedTouches[0].clientX;
        let touchEndY = event.changedTouches[0].clientY;
        
        //       ,      
        if(touchEndX - touchStartX > 60 && Math.abs(touchEndY - touchStartY) < 40) {
            replyToMessage(msgId);
            if(navigator.vibrate) navigator.vibrate(40); //      
        }
    }
    touchStartX = 0;
    touchStartY = 0;
    isSwiping = false;
}

function enterSelectionMode(msgId) {
    isMsgSelectionMode = true;
    selectedMsgIds = [];
    const bar = document.getElementById('selection-bottom-bar');
    const inputArea = document.getElementById('chat-input-area');
    if(bar) bar.classList.add('active');
    if(inputArea) inputArea.style.display = 'none';
    toggleMsgSelection(msgId);
    if(navigator.vibrate) navigator.vibrate(50);
}

function handleMsgClick(msgId) {
    if(isMsgSelectionMode) {
        toggleMsgSelection(msgId);
    }
}

function toggleMsgSelection(msgId) {
    const idx = selectedMsgIds.indexOf(msgId);
    const wrapper = document.querySelector(`.chat-bubble-wrapper[data-msgid="${msgId}"]`);
    if(idx > -1) {
        selectedMsgIds.splice(idx, 1);
        if(wrapper) wrapper.classList.remove('selected');
    } else {
        selectedMsgIds.push(msgId);
        if(wrapper) wrapper.classList.add('selected');
    }
    const count = selectedMsgIds.length;
    const countText = document.getElementById('selected-count-text');
    if(countText) countText.textContent = count + ' Selected';
    if(count === 0) closeSelectionMode();
}

function closeSelectionMode() {
    isMsgSelectionMode = false;
    selectedMsgIds = [];
    const bar = document.getElementById('selection-bottom-bar');
    const inputArea = document.getElementById('chat-input-area');
    if(bar) bar.classList.remove('active');
    if(inputArea) inputArea.style.display = 'flex';
    document.querySelectorAll('.chat-bubble-wrapper.selected').forEach(el => el.classList.remove('selected'));
}

function showDeleteSheet() {
    if(selectedMsgIds.length === 0) return;
    let allMine = true;
    selectedMsgIds.forEach(msgId => {
        const wrapper = document.querySelector(`.chat-bubble-wrapper[data-msgid="${msgId}"]`);
        if(wrapper && wrapper.classList.contains('theirs')) allMine = false;
    });
    const btnEveryone = document.getElementById('btn-delete-everyone');
    const sheetTitle = document.getElementById('delete-sheet-title');
    if(!allMine) {
        if(btnEveryone) btnEveryone.style.display = 'none';
        if(sheetTitle) sheetTitle.textContent = "Can't delete others' messages for everyone";
    } else {
        if(btnEveryone) btnEveryone.style.display = 'flex';
        if(sheetTitle) sheetTitle.textContent = `Delete ${selectedMsgIds.length} message(s)?`;
    }
    const modal = document.getElementById('delete-sheet-modal');
    if(modal) modal.classList.add('open');
}

function closeDeleteSheet() {
    const modal = document.getElementById('delete-sheet-modal');
    if(modal) modal.classList.remove('open');
}

async function executeDelete(type) {
    if(selectedMsgIds.length === 0) return;
    showToast("Deleting...");
    closeDeleteSheet();
    try {
        const batch = db.batch();
        selectedMsgIds.forEach(msgId => {
            const ref = db.collection('chats').doc(currentChatId).collection('messages').doc(msgId);
            if (type === 'everyone') {
                batch.delete(ref);
            } else if (type === 'forme') {
                batch.set(ref, { deletedFor: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) }, { merge: true });
            }
        });
        await batch.commit();
        showToast("Messages deleted!");
    } catch(e) {
        showToast("Failed to delete messages");
    }
    closeSelectionMode();
}
// ===== NEW CHAT HEADER MENU FUNCTIONS =====

//       -  
// -      
function viewProfileFromChat() {
    document.getElementById('chat-delete-menu').style.display = 'none';
    if (currentChatOtherUid === 'group') {
        //       
        openGroupInfoModal(currentChatId);
        return;
    }
        
    //      
    const nameText = document.getElementById('chat-name-display').innerText; 
    const avatarHtml = document.getElementById('chat-avatar').innerHTML;
    
    //        
    const otherUser = allUsersCache ? allUsersCache.find(u => u.id === currentChatOtherUid) : null;
    const isV = otherUser ? otherUser.isVerified : false;
    const vBadge = getVerifiedBadge(otherUser ? otherUser.email : '', isV);
    
    //     
    document.getElementById('qp-name').innerHTML = nameText + vBadge;
    document.getElementById('qp-avatar').innerHTML = avatarHtml;
        
    //            
    const isMuted = currentUserData.mutedChats?.includes(currentChatId);
    const muteBtn = document.getElementById('qp-mute-btn');
    if (isMuted) {
        muteBtn.innerHTML = '<i class="ph-bold ph-bell-ringing" style="font-size:18px;"></i> Unmute';
    } else {
        muteBtn.innerHTML = '<i class="ph-bold ph-bell-slash" style="font-size:18px;"></i> Mute';
    }
    // -  
    document.getElementById('quick-profile-modal').classList.add('open');
}


// -   
function closeQuickProfile() {
    document.getElementById('quick-profile-modal').classList.remove('open');
}

// "View Profile"      
function goToFullProfile() {
    closeQuickProfile();
    const profilePage = document.getElementById('page-other-profile');
    if(profilePage) {
        profilePage.classList.add('open');
        viewUserProfile(currentChatOtherUid);
    }
    setTimeout(() => { closeChat(); }, 50);
}

//    
async function toggleMuteFromQP() {
    await muteChat(currentChatId);
    closeQuickProfile();
}

async function archiveFromQP() {
    await archiveChat(currentChatId);
    closeQuickProfile();
    closeChat(); //        
}

async function blockFromQP() {
    closeQuickProfile();
    await blockUserFromChat(); 
}

async function clearChatFromQP() {
    closeQuickProfile();
    await clearChatForMe(); 
}


// . Clear Chat (Delete for me) 
async function clearChatForMe() {
    document.getElementById('chat-delete-menu').style.display = 'none';
    if (!confirm("Are you sure you want to clear this chat for yourself?")) return;
    
    showToast("Clearing chat...");
    try {
        const messagesRef = db.collection('chats').doc(currentChatId).collection('messages');
        const snap = await messagesRef.get();
        const batch = db.batch();
        
        snap.forEach(doc => {
            batch.set(doc.ref, { deletedFor: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) }, { merge: true });
        });
        await batch.commit();
        
        //        
        document.getElementById('chat-messages').innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">Chat cleared</div>';
        showToast("Chat cleared!");
    } catch (e) {
        showToast("Failed to clear chat");
    }
}

// . Block User 
async function blockUserFromChat() {
    document.getElementById('chat-delete-menu').style.display = 'none';
    if (currentChatOtherUid === 'group') {
        showToast("Cannot block a group.");
        return;
    }
    if (!confirm("Are you sure you want to block this user?")) return;
    
    try {
        await db.collection('users').doc(currentUser.uid).update({
            blockedUsers: firebase.firestore.FieldValue.arrayUnion(currentChatOtherUid)
        });
        showToast("User blocked successfully");
        closeChat(); //        
        loadMessages(); //    
    } catch (e) {
        showToast("Failed to block user");
    }
}

// ===== FIXED COMMENT ACTIONS =====

function showCommentActions(pid, idx, commentUid) {
    if (commentUid !== currentUser.uid) {
        showToast("You can only manage your own comments.");
        return;
    }

    const menu = document.createElement('div');
    menu.className = 'comment-action-menu'; 
    menu.style.cssText = `position:fixed; bottom:0; left:0; width:100%; background:var(--surface); border-radius:20px 20px 0 0; padding:20px; z-index:99999; box-shadow:0 -5px 20px rgba(0,0,0,0.3);`;
    
    menu.innerHTML = `
        <div style="font-weight:800; margin-bottom:15px; text-align:center;">Comment Options</div>
        <div class="chat-dropdown-item" onclick="editComment('${pid}', ${idx}); this.parentElement.remove();">
            <span class="material-symbols-outlined">edit</span> Edit Comment
        </div>
        <div class="chat-dropdown-item" onclick="copyComment(this); this.parentElement.remove();">
            <span class="material-symbols-outlined">content_copy</span> Copy
        </div>
        <div class="chat-dropdown-item danger" onclick="deleteComment('${pid}', ${idx}); this.parentElement.remove();">
            <span class="material-symbols-outlined">delete</span> Delete Comment
        </div>
        <div style="margin-top:10px; padding:10px; text-align:center; color:var(--text-muted); cursor:pointer;" onclick="this.parentElement.remove()">Cancel</div>
    `;
    document.body.appendChild(menu);
}

async function editComment(pid, idx) {
    const ref = db.collection('posts').doc(pid);
    const doc = await ref.get();
    if (!doc.exists) return;
    
    let comments = doc.data().comments;
    const oldText = comments[idx].text;
    const newText = prompt("Edit your comment:", oldText);
    
    if (newText !== null && newText.trim() !== "") {
        comments[idx].text = newText.trim();
        await ref.update({ comments });
        showToast("Comment updated!");
    }
}

function copyComment(btnElement) {
    //     
    const commentItem = btnElement.closest('.comment-item');
    if (commentItem) {
        //  -    (  )
        const textToCopy = commentItem.querySelector('div[style*="margin-top:4px"]').textContent;
        navigator.clipboard.writeText(textToCopy).then(() => {
            showToast("Copied to clipboard!");
        });
    }
}

async function deleteComment(pid, idx) {
    if (!confirm("Delete this comment?")) return;
    const ref = db.collection('posts').doc(pid);
    const doc = await ref.get();
    if (!doc.exists) return;
    
    let comments = doc.data().comments;
    comments.splice(idx, 1);
    await ref.update({ comments });
    showToast("Comment deleted!");
}
async function fixMissingNamesInChats() {
    //         
    if (!currentUser) return;
    
    const chatsRef = db.collection('chats');
    const snap = await chatsRef.get();
    
    snap.forEach(async (doc) => {
        const data = doc.data();
        //   'names'      'User' 
        if (!data.names || Object.keys(data.names).length < 2) {
            const parts = doc.id.split('_');
            if (parts.length === 2) {
                const otherUid = parts[0] === currentUser.uid ? parts[1] : parts[0];
                
                //      
                const userDoc = await db.collection('users').doc(otherUid).get();
                if (userDoc.exists) {
                    const userName = userDoc.data().name;
                    await chatsRef.doc(doc.id).set({
                        names: { 
                            [currentUser.uid]: currentUserData.name, 
                            [otherUid]: userName 
                        }
                    }, { merge: true });
                    console.log("Fixed name for chat:", doc.id);
                }
            }
        }
    });
}
// ===== @ MENTION SYSTEM =====
let mentionData = {
  friends: [],
  filterText: '',
  selectedIndex: 0,
  textarea: null,
  dropdown: null,
  startPos: 0,
  endPos: 0
};

//     
async function loadMentionFriends() {
  if (!currentUserData || !currentUserData.friends || currentUserData.friends.length === 0) {
    mentionData.friends = [];
    return;
  }
  
  try {
    const friendDocs = currentUserData.friends.map(uid => db.collection('users').doc(uid).get());
    const snapshots = await Promise.all(friendDocs);
    
    mentionData.friends = snapshots
      .filter(doc => doc.exists)
      .map(doc => ({
        uid: doc.id,
        name: doc.data().name || 'User',
        avatar: doc.data().avatar || ''
      }));
  } catch (e) {
    console.error('Error loading mention friends:', e);
    mentionData.friends = [];
  }
}

// @ Mention  
function handleMentionInput(textarea, dropdownId, event) {
  const dropdown = document.getElementById(dropdownId);
  if (!dropdown) return;
  
  const text = textarea.value;
  const cursorPos = textarea.selectionStart;
  
  // @ 
  const lastAtIndex = text.lastIndexOf('@', cursorPos - 1);
  
  //  @    @    
  if (lastAtIndex === -1) {
    hideMentionDropdown(dropdown);
    return;
  }
  
  // @      
  const betweenText = text.substring(lastAtIndex + 1, cursorPos);
  if (betweenText.includes(' ') || betweenText.includes('\n')) {
    hideMentionDropdown(dropdown);
    return;
  }
  
    //    
  if (dropdownId === 'comment-mention-dropdown') {
      //       ( ) 
      dropdown.style.left = '16px';
      dropdown.style.bottom = '75px'; 
      dropdown.style.top = 'auto';
      dropdown.style.width = 'calc(100% - 32px)'; 
  } else {
      //   (  )    
      const coords = getCaretCoordinates(textarea, cursorPos);
      dropdown.style.left = coords.left + 'px';
      dropdown.style.top = (coords.top + textarea.offsetTop + 30) + 'px';
      dropdown.style.bottom = 'auto';
  }
  
  //  
  const filterText = betweenText.toLowerCase();
  
  //   
  const filtered = mentionData.friends.filter(f => 
    f.name.toLowerCase().includes(filterText)
  );
  
  if (filtered.length === 0) {
    hideMentionDropdown(dropdown);
    return;
  }
  
  //   
  renderMentionDropdown(dropdown, filtered, textarea, lastAtIndex, cursorPos);
}
// Mention Dropdown  
function renderMentionDropdown(dropdown, friends, textarea, startPos, endPos) {
  mentionData.selectedIndex = 0;
  
  let html = friends.map((friend, index) => {
    const safeName = escapeHTML(friend.name);
    const avHtml = friend.avatar 
      ? `<img src="${escapeHTML(friend.avatar)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`
      : avatarInitial(friend.name);
    
    return `
      <div class="mention-item ${index === 0 ? 'selected' : ''}" 
           onclick="selectMention('${friend.uid}', '${safeName}', ${startPos}, ${endPos})"
           onmouseenter="selectMentionIndex(${index})">
        <div class="avatar sm">${avHtml}</div>
        <div class="mention-info">
          <div class="mention-name">${safeName}</div>
        </div>
      </div>
    `;
  }).join('');
  
  dropdown.innerHTML = html;
  dropdown.classList.add('show');
  
  //  
  mentionData.textarea = textarea;
  mentionData.dropdown = dropdown;
  mentionData.startPos = startPos;
  mentionData.endPos = endPos;
}

// Mention  
function selectMention(uid, name, startPos, endPos) {
  if (!mentionData.textarea) return;
  
  const textarea = mentionData.textarea;
  const text = textarea.value;
  
  // @mention   
  const beforeText = text.substring(0, startPos);
  const afterText = text.substring(endPos);
  const mentionText = `@${name} `;
  
  textarea.value = beforeText + mentionText + afterText;
  
  //    
  const newPos = startPos + mentionText.length;
  textarea.setSelectionRange(newPos, newPos);
  textarea.focus();
  
  //   
  if (mentionData.dropdown) {
    hideMentionDropdown(mentionData.dropdown);
  }
  
  //     ( )
  if (currentTaggedFriends && !currentTaggedFriends.includes(uid)) {
    currentTaggedFriends.push(uid);
    currentTaggedNames.push(name);
    updateTagCount();
    updateTagPreview();
  }
}

// Mention Index   ( )
function selectMentionIndex(index) {
  mentionData.selectedIndex = index;
  const items = mentionData.dropdown.querySelectorAll('.mention-item');
  items.forEach((item, i) => {
    item.classList.toggle('selected', i === index);
  });
}

// Mention Dropdown  
function hideMentionDropdown(dropdown) {
  if (dropdown) {
    dropdown.classList.remove('show');
  }
  mentionData.textarea = null;
  mentionData.dropdown = null;
}

//   
function getCaretCoordinates(element, position) {
  const div = document.createElement('div');
  const style = getComputedStyle(element);
  
  //   
  Array.from(style).forEach(prop => {
    div.style.setProperty(prop, style.getPropertyValue(prop));
  });
  
  div.style.position = 'absolute';
  div.style.visibility = 'hidden';
  div.style.whiteSpace = 'pre-wrap';
  div.style.width = style.width;
  
  const text = element.value.substring(0, position);
  div.textContent = text;
  
  const span = document.createElement('span');
  span.textContent = element.value.substring(position) || '.';
  div.appendChild(span);
  
  document.body.appendChild(div);
  
  const coords = {
    left: span.offsetLeft,
    top: span.offsetTop
  };
  
  document.body.removeChild(div);
  
  return coords;
}

//  
function handleMentionKeydown(event, dropdownId) {
  const dropdown = document.getElementById(dropdownId);
  if (!dropdown || !dropdown.classList.contains('show')) return;
  
  const items = dropdown.querySelectorAll('.mention-item');
  if (items.length === 0) return;
  
  switch(event.key) {
    case 'ArrowDown':
      event.preventDefault();
      mentionData.selectedIndex = (mentionData.selectedIndex + 1) % items.length;
      updateMentionSelection(items);
      break;
      
    case 'ArrowUp':
      event.preventDefault();
      mentionData.selectedIndex = (mentionData.selectedIndex - 1 + items.length) % items.length;
      updateMentionSelection(items);
      break;
      
    case 'Enter':
    case 'Tab':
      event.preventDefault();
      items[mentionData.selectedIndex].click();
      break;
      
    case 'Escape':
      hideMentionDropdown(dropdown);
      break;
  }
}

function updateMentionSelection(items) {
  items.forEach((item, index) => {
    item.classList.toggle('selected', index === mentionData.selectedIndex);
  });
}

//   
function updateTagCount() {
  const tagCount = document.getElementById('tag-count');
  if (tagCount) {
    tagCount.textContent = currentTaggedFriends.length;
    tagCount.style.display = currentTaggedFriends.length > 0 ? 'inline-block' : 'none';
  }
}

//   
document.addEventListener('DOMContentLoaded', () => {
  //  
  const postTextarea = document.getElementById('post-title');
  if (postTextarea) {
    postTextarea.addEventListener('input', (e) => {
      handleMentionInput(e.target, 'post-mention-dropdown', e);
    });
    
    postTextarea.addEventListener('keydown', (e) => {
      handleMentionKeydown(e, 'post-mention-dropdown');
    });
    
    //    
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#post-mention-dropdown') && e.target !== postTextarea) {
        const dropdown = document.getElementById('post-mention-dropdown');
        if (dropdown) hideMentionDropdown(dropdown);
      }
    });
  }
  
  //  
  const commentInput = document.getElementById('comment-panel-input');
  if (commentInput) {
    commentInput.addEventListener('input', (e) => {
      handleMentionInput(e.target, 'comment-mention-dropdown', e);
    });
    
    commentInput.addEventListener('keydown', (e) => {
      handleMentionKeydown(e, 'comment-mention-dropdown');
    });
    
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#comment-mention-dropdown') && e.target !== commentInput) {
        const dropdown = document.getElementById('comment-mention-dropdown');
        if (dropdown) hideMentionDropdown(dropdown);
      }
    });
  }
});

//     ,   
const originalOpenCreatePost = window.openCreatePost;
window.openCreatePost = function() {
  if (originalOpenCreatePost) originalOpenCreatePost();
  loadMentionFriends();
};
// Interested    (  )
async function markInterested(postId) {
    closeAllDropdowns();
    if (!currentUser) return;

    //    
    if (!currentUserData.savedPosts) currentUserData.savedPosts = [];
    
    if (!currentUserData.savedPosts.includes(postId)) {
        currentUserData.savedPosts.push(postId);
        showToast("Saving post...");
        
        try {
            //    
            await db.collection('users').doc(currentUser.uid).update({
                savedPosts: firebase.firestore.FieldValue.arrayUnion(postId)
            });
            showToast("Marked as Interested & Saved!");
        } catch(e) {
            console.error("Error saving post:", e);
            showToast("Failed to save post.");
        }
    } else {
        showToast("Already saved in your list!");
    }
}

// Not Interested   
function markNotInterested(pid, element) {
    closeAllDropdowns();
    showToast('Post hidden from your feed');
    
    //          
    const postCard = element.closest('.post-card');
    if(postCard) {
        postCard.style.display = 'none';
    }
}
//    
async function downloadCurrentStory(event) {
    if(event) event.stopPropagation();
    
    const menu = document.getElementById('story-menu');
    if(menu) menu.classList.remove('open');
    
    if(!activeStoryGroup || currentStoryIndex >= activeStoryGroup.length) return;
    
    const s = activeStoryGroup[currentStoryIndex];
    let mediaUrl = s.mediaUrl;
    if(!mediaUrl) return;

    showToast("Starting download...");

    if (mediaUrl.includes('cloudinary.com')) {
        if (!mediaUrl.includes('fl_attachment')) {
            mediaUrl = mediaUrl.replace('/upload/', '/upload/fl_attachment:GoChat_Story/');
        }
        window.location.href = mediaUrl;
        return;
    }

    try {
        const response = await fetch(mediaUrl);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = blobUrl;
        
        const ext = s.isVideo ? '.mp4' : '.jpg';
        a.download = 'GoChat_Story_' + Date.now() + ext;
        
        document.body.appendChild(a);
        a.click();
        
        window.URL.revokeObjectURL(blobUrl);
        document.body.removeChild(a);
    } catch (e) {
        window.open(mediaUrl, '_blank');
    }
}
// --- Colored Post Logic ---
let currentPostBgColor = 'default';

function toggleColorPicker() {
    document.getElementById('bg-color-picker').classList.toggle('show');
}

function selectPostBg(color, element) {
    currentPostBgColor = color;
    
    //          
    const circles = document.querySelectorAll('.color-circle');
    circles.forEach(c => c.classList.remove('selected'));
    if (element) element.classList.add('selected');
    
    const textarea = document.getElementById('post-title');
    if (color === 'default') {
        textarea.style.background = 'transparent';
        textarea.style.color = 'var(--text)';
        textarea.style.textAlign = 'left';
        textarea.style.fontWeight = '500';
        textarea.style.padding = '0';
    } else {
        textarea.style.background = color;
        textarea.style.color = '#ffffff'; //      
        textarea.style.textAlign = 'center';
        textarea.style.fontWeight = '800';
        textarea.style.padding = '30px 20px';
        textarea.style.borderRadius = '16px';
    }
}
async function toggleMuteFeed(uid) {
    if (!currentUser) return;
    //      
    let mutedList = currentUserData.mutedFeedUsers || [];
    if (mutedList.includes(uid)) {
        await db.collection('users').doc(currentUser.uid).update({
            mutedFeedUsers: firebase.firestore.FieldValue.arrayRemove(uid)
        });
        showToast("User unhidden from feed");
    } else {
        await db.collection('users').doc(currentUser.uid).update({
            mutedFeedUsers: firebase.firestore.FieldValue.arrayUnion(uid)
        });
        showToast("User hidden from feed");
    }
    closeAllDropdowns();
    closeUserProfile();
    loadFeed();
}
// Followers  Following    
async function openFollowList(type, uid) {
    const modal = document.getElementById('friends-list-modal');
    modal.style.zIndex = "100000"; 
    modal.classList.add('open');
    
    const container = document.getElementById('friends-list-container');
    const titleEl = document.querySelector('#friends-list-modal .modal-title');
    if(titleEl) titleEl.innerHTML = type === 'followers' ? 'Followers' : 'Following';
    
    container.innerHTML = '<div class="loading"><span class="material-symbols-outlined">autorenew</span> Loading...</div>';
    
    const doc = await db.collection('users').doc(uid).get();
    if(!doc.exists) return;
    
    const userData = doc.data();

    //    (   )
    if (uid !== currentUser.uid && type === 'following') {
        const privacy = userData.followingPrivacy || 'everyone';
        if (privacy === 'onlyme') {
            container.innerHTML = `<div class="empty-feed"><span class="material-symbols-outlined" style="font-size:48px; opacity:0.3; margin-bottom:12px;">lock</span><br>This user's following list is private</div>`;
            return;
        }
    }
    
    const list = userData[type] || [];
    if(list.length === 0) {
        container.innerHTML = `<div class="empty-feed">No ${type} yet</div>`;
        return;
    }
    
    try {
        const userDocs = list.map(id => db.collection('users').doc(id).get());
        const snapshots = await Promise.all(userDocs);
        let html = '';
        snapshots.forEach((sDoc, index) => {
            if(sDoc.exists) {
                const u = sDoc.data();
                const safeName = escapeHTML(u.name);
                const avHtml = u.avatar ? `<img src="${u.avatar}">` : avatarInitial(u.name);
                
                html += `<div class="msg-item" onclick="closeFriendsListModal(); viewUserProfile('${list[index]}')">
                    <div class="avatar">${avHtml}</div>
                    <div class="msg-info" style="margin-left:10px;">${safeName} ${getVerifiedBadge(u.email, u.isVerified || false)}</div>
                </div>`;
            }
        });
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = '<div class="empty-feed">Failed to load list</div>';
    }
}
function openFollowingPrivacy() {
    document.getElementById('following-privacy-modal').classList.add('open');
    const mode = currentUserData.followingPrivacy || 'everyone';
    document.getElementById('priv-everyone').checked = (mode === 'everyone');
    document.getElementById('priv-onlyme').checked = (mode === 'onlyme');
}

async function setFollowingPrivacy(mode) {
    await db.collection('users').doc(currentUser.uid).update({ followingPrivacy: mode });
    currentUserData.followingPrivacy = mode;
    document.getElementById('following-privacy-modal').classList.remove('open');
    showToast("Privacy updated!");
}
// ===== GALLERY SYSTEM LOGIC =====
let isGalleryEditMode = false;
let selectedGalleryImages = []; //   postId  imgIndex  

async function openGallery() {
    document.getElementById('gallery-screen').style.display = 'flex';
    isGalleryEditMode = false;
    selectedGalleryImages = [];
    updateGalleryUI();
    await loadGalleryImages();
}

function closeGallery() {
    document.getElementById('gallery-screen').style.display = 'none';
    isGalleryEditMode = false;
}

function toggleGalleryEditMode() {
    isGalleryEditMode = !isGalleryEditMode;
    selectedGalleryImages = [];
    updateGalleryUI();
}

function updateGalleryUI() {
    const btn = document.getElementById('gallery-edit-btn');
    const bar = document.getElementById('gallery-selection-bar');
    const items = document.querySelectorAll('.gallery-item');
    
    if(isGalleryEditMode) {
        btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;">close</span> Cancel';
        btn.style.color = 'var(--danger)';
        btn.style.background = 'rgba(255, 77, 106, 0.1)';
        bar.style.display = 'flex';
        items.forEach(el => el.classList.add('edit-mode'));
    } else {
        btn.textContent = 'Edit';
        btn.style.color = 'var(--text)';
        btn.style.background = 'var(--surface-2)';
        bar.style.display = 'none';
        items.forEach(el => {
            el.classList.remove('edit-mode', 'selected');
        });
        document.getElementById('gallery-selected-count').textContent = '0 Selected';
    }
}

async function loadGalleryImages() {
    const grid = document.getElementById('gallery-grid');
    grid.innerHTML = '<div class="loading" style="grid-column: span 3; text-align:center; padding: 40px;"><span class="material-symbols-outlined">autorenew</span> Loading...</div>';
    
    try {
        const snap = await db.collection('posts').where('uid', '==', currentUser.uid).get();
        let allImages = [];
        
        snap.forEach(doc => {
            const data = doc.data();
            let urls = [];
            //     
            if(data.imgUrls && data.imgUrls.length > 0) urls = data.imgUrls;
            else if(data.imgUrl) urls = [data.imgUrl];
            
            //   (imgIndex)    
            urls.forEach((url, index) => {
                allImages.push({ 
                    postId: doc.id, 
                    imgUrl: url, 
                    imgIndex: index, 
                    createdAt: data.createdAt 
                });
            });
        });
        
        //      
        allImages.sort((a,b) => {
            const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
            const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
            return tb - ta; 
        });
        
        if(allImages.length === 0) {
            grid.innerHTML = '<div class="empty-feed" style="grid-column: span 3;">No images found in your gallery.</div>';
            return;
        }
        
        let html = '';
        allImages.forEach(img => {
            const safeUrl = escapeHTML(img.imgUrl);
            //   postId  imgIndex (number )   
            html += `
            <div class="gallery-item ${isGalleryEditMode ? 'edit-mode' : ''}" onclick="handleGalleryItemClick('${img.postId}', ${img.imgIndex}, '${safeUrl}', this)">
                <img src="${safeUrl}">
                <div class="select-overlay">
                    <span class="material-symbols-outlined select-icon">check_circle</span>
                </div>
            </div>`;
        });
        grid.innerHTML = html;
    } catch(e) {
        grid.innerHTML = '<div class="empty-feed" style="grid-column: span 3;">Failed to load gallery</div>';
    }
}

function handleGalleryItemClick(postId, imgIndex, imgUrl, element) {
    if(!isGalleryEditMode) {
        openImageZoom(imgUrl);
        return;
    }
    
    const isSelected = element.classList.contains('selected');
    if(isSelected) {
        element.classList.remove('selected');
        //      
        selectedGalleryImages = selectedGalleryImages.filter(item => !(item.postId === postId && item.imgIndex === imgIndex));
    } else {
        element.classList.add('selected');
        //    
        selectedGalleryImages.push({ postId: postId, imgIndex: imgIndex });
    }
    
    document.getElementById('gallery-selected-count').textContent = selectedGalleryImages.length + ' Selected';
}

async function deleteSelectedGalleryImages() {
    if(selectedGalleryImages.length === 0) return;
    if(!confirm(`Are you sure you want to delete ${selectedGalleryImages.length} image(s)?`)) return;
    
    showToast("Deleting images...");
    const btn = document.querySelector('#gallery-selection-bar .btn-primary');
    if(btn) { btn.disabled = true; btn.innerHTML = '<span class="material-symbols-outlined">autorenew</span> Deleting...'; }
    
    try {
        const groupedByPost = {};
        selectedGalleryImages.forEach(item => {
            if(!groupedByPost[item.postId]) groupedByPost[item.postId] = [];
            groupedByPost[item.postId].push(item.imgIndex);
        });
        
        const batch = db.batch();
        const postRefs = Object.keys(groupedByPost).map(pid => db.collection('posts').doc(pid).get());
        const snapshots = await Promise.all(postRefs);
        
        snapshots.forEach(doc => {
            if(doc.exists) {
                const data = doc.data();
                const indexesToDelete = groupedByPost[doc.id];
                
                let currentUrls = [];
                if(data.imgUrls && data.imgUrls.length > 0) currentUrls = data.imgUrls;
                else if(data.imgUrl) currentUrls = [data.imgUrl];
                
                //        (URL    )
                const remainingUrls = currentUrls.filter((url, idx) => !indexesToDelete.includes(idx));
                
                //           ,   
                if(remainingUrls.length === 0 && (!data.title || data.title.trim() === '')) {
                    batch.delete(doc.ref);
                } else {
                    //    ,       (   )
                    batch.update(doc.ref, {
                        imgUrls: remainingUrls,
                        imgUrl: remainingUrls.length > 0 ? remainingUrls[0] : ''
                    });
                }
            }
        });
        
        await batch.commit();
        
        //     
        isGalleryEditMode = false;
        selectedGalleryImages = [];
        updateGalleryUI();
        
        showToast("Images deleted successfully!");
        
        // UI 
        await loadGalleryImages();
        if(document.getElementById('page-profile').classList.contains('active')) loadMyPosts();
        loadFeed();
    } catch(e) {
        console.error(e);
        showToast("Failed to delete images.");
    } finally {
        if(btn) { btn.disabled = false; btn.innerHTML = '<span class="material-symbols-outlined">delete</span> Delete'; }
    }
}
//        
function goToLogin() {
    document.getElementById('welcome-step').style.display = 'none';
    document.getElementById('login-form').style.display = 'block';
}
//   
function showRegister() {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('registration-steps').style.display = 'block';
}

function backToLogin() {
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('registration-steps').style.display = 'none';
}

function goToStep2() {
    if(!document.getElementById('reg-fname').value || !document.getElementById('reg-email').value) {
        showToast("Please fill all fields!");
        return;
    }
    document.getElementById('step-1').style.display = 'none';
    document.getElementById('step-2').style.display = 'block';
}

async function completeRegistration() {
    const fname = document.getElementById('reg-fname').value.trim();
    const lname = document.getElementById('reg-lname').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const pass = document.getElementById('reg-pass').value;
    const confirmPass = document.getElementById('reg-confirm').value;

    if (pass !== confirmPass) { showToast("Passwords don't match!"); return; }
    if (pass.length < 6) { showToast("Password must be 6+ chars!"); return; }

    showToast("Creating account...");
    try {
        const result = await auth.createUserWithEmailAndPassword(email, pass);
        const user = result.user;
        const fullName = fname + ' ' + lname;

        await db.collection('users').doc(user.uid).set({
            name: fullName,
            email: user.email,
            avatar: '', bio: '', friends: [], followers: [], following: [],
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast("Account created successfully!");
    } catch (e) {
        showToast("Error: " + e.message);
    }
}
// ===== TEXT STORY LOGIC =====
let currentTextStoryBg = 'linear-gradient(135deg, #7c5cff 0%, #c084fc 100%)';

function openTextStoryModal() {
    document.getElementById('create-text-story-modal').style.display = 'flex';
    document.getElementById('text-story-input').value = '';
    document.getElementById('text-story-preview').style.background = currentTextStoryBg;
    checkTextStoryInput();
}

function closeTextStoryModal() {
    document.getElementById('create-text-story-modal').style.display = 'none';
}

function checkTextStoryInput() {
    const txt = document.getElementById('text-story-input').value.trim();
    const btn = document.getElementById('modal-text-story-btn');
    if(txt) {
        btn.disabled = false;
        btn.style.opacity = '1';
    } else {
        btn.disabled = true;
        btn.style.opacity = '0.5';
    }
}

function selectTextStoryBg(color, element) {
    currentTextStoryBg = color;
    document.getElementById('text-story-preview').style.background = color;
    const circles = element.parentElement.querySelectorAll('.color-circle');
    circles.forEach(c => c.classList.remove('selected'));
    element.classList.add('selected');
}

async function submitTextStory() {
    const text = document.getElementById('text-story-input').value.trim();
    if(!text || !checkRateLimit()) return;

    const btn = document.getElementById('modal-text-story-btn');
    btn.textContent = "Posting...";
    btn.disabled = true;

    try {
        await db.collection('stories').add({
            uid: currentUser.uid,
            name: currentUserData.name,
            avatar: currentUserData.avatar || '',
            isText: true, //     
            text: text,
            bgColor: currentTextStoryBg,
            views: [],
            reacts: [],
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            expiresAt: new Date(Date.now() + ONE_DAY_MS)
        });
        showToast('Text Story added!');
        awardPoints(currentUser.uid, 15);
        closeTextStoryModal();
    } catch(e) {
        console.error(e);
        showToast('Failed to add story.');
    } finally {
        btn.textContent = "Post Story";
        btn.disabled = false;
    }
}
// Active Status    (Updated & Instant)
async function toggleActiveStatus() {
    if (!currentUser) return;
    
    const currentStatus = currentUserData.showActiveStatus !== false; 
    const newStatus = !currentStatus;
    
    //          
    await db.collection('users').doc(currentUser.uid).update({
        showActiveStatus: newStatus,
        online: newStatus 
    });
    
    //   
    currentUserData.showActiveStatus = newStatus;
    currentUserData.online = newStatus;
    
    updateActiveStatusUI();
    showToast(`Active Status is now ${newStatus ? 'ON' : 'OFF'}`);
}

// UI   
function updateActiveStatusUI() {
    const toggleEl = document.getElementById('active-status-toggle');
    if (toggleEl) {
        const isOn = (currentUserData.showActiveStatus !== false);
        if (isOn) {
            toggleEl.classList.add('active');
        } else {
            toggleEl.classList.remove('active');
        }
    }
}
// === Email Change System (Complete & Bug-Free) ===
function openChangeEmailModal() {
    document.getElementById('change-email-modal').classList.add('open');
}

function closeChangeEmailModal() {
    //        
    const passInput = document.getElementById('email-curr-pass');
    const newEmailInput = document.getElementById('email-new');
    if(passInput) passInput.value = '';
    if(newEmailInput) newEmailInput.value = '';
    
    document.getElementById('change-email-modal').classList.remove('open');
}

async function changeEmailAction() {
    const passInput = document.getElementById('email-curr-pass');
    const newEmailInput = document.getElementById('email-new');
    const pass = passInput.value;
    const newEmail = newEmailInput.value.trim();
    
    const btn = document.querySelector('#change-email-modal .btn-primary');

    if(!pass || !newEmail) { 
        alert(" Please fill all the fields!"); 
        return; 
    }

    const originalText = btn.textContent;
    btn.textContent = "Verifying...";
    btn.disabled = true;
    
    try {
        const user = auth.currentUser;
        
        // .      (High Security)
        const cred = firebase.auth.EmailAuthProvider.credential(user.email, pass);
        await user.reauthenticateWithCredential(cred);
        
        // .   
        await user.updateEmail(newEmail);
        
        // .     
        await db.collection('users').doc(user.uid).update({
            email: newEmail
        });

        // .       
        currentUserData.email = newEmail;
        const displayEl = document.getElementById('contact-email-display');
        if(displayEl) displayEl.textContent = newEmail;

        // .  
        alert(" Success! Your email has been transferred to " + newEmail);
        
        closeChangeEmailModal();
        doLogout(); //         
        
    } catch(e) {
        console.error(e);
        //      
        if (e.code === 'auth/wrong-password') {
            alert(" Error: Incorrect current password!");
        } else if (e.code === 'auth/invalid-email') {
            alert(" Error: The new email format is invalid!");
        } else if (e.code === 'auth/email-already-in-use') {
            alert(" Error: This email is already in use by another account!");
        } else if (e.code === 'auth/requires-recent-login') {
            alert(" Error: For security, please log out and log in again before changing email.");
        } else {
            alert(" Error: " + e.message);
        }
    } finally {
        //       
        btn.textContent = originalText;
        btn.disabled = false;
    }
}
// === Private Account Toggle Logic ===
async function togglePrivateAccount() {
    if (!currentUser) return;
    
    //    
    const currentStatus = currentUserData.isPrivate === true; 
    const newStatus = !currentStatus;
    
    //  
    await db.collection('users').doc(currentUser.uid).update({
        isPrivate: newStatus
    });
    
    //   
    currentUserData.isPrivate = newStatus;
    
    // UI 
    updatePrivateAccountUI();
    showToast(`Private Account is now ${newStatus ? 'ON' : 'OFF'}`);
}

function updatePrivateAccountUI() {
    const toggleEl = document.getElementById('private-account-toggle');
    if (toggleEl) {
        const isOn = (currentUserData.isPrivate === true);
        if (isOn) {
            toggleEl.classList.add('active');
        } else {
            toggleEl.classList.remove('active');
        }
    }
}
// ===  Message Sound Toggle Logic ===
async function toggleMessageSound() {
    if (!currentUser) return;
    
    //   ON ,  undefined  true 
    const currentStatus = currentUserData.messageSound !== false; 
    const newStatus = !currentStatus;
    
    //  
    await db.collection('users').doc(currentUser.uid).update({
        messageSound: newStatus
    });
    
    //   
    currentUserData.messageSound = newStatus;
    
    // UI 
    updateMessageSoundUI();
    showToast(`Message Sound is now ${newStatus ? 'ON' : 'OFF'}`);
}

function updateMessageSoundUI() {
    const toggleEl = document.getElementById('message-sound-toggle');
    if (toggleEl) {
        const isOn = (currentUserData.messageSound !== false); //  ON
        if (isOn) {
            toggleEl.classList.add('active');
        } else {
            toggleEl.classList.remove('active');
        }
    }
}
// ==========================================
//  SAVED ITEMS SYSTEM LOGIC
// ==========================================
function openSavedItems() {
    document.getElementById('saved-items-screen').style.display = 'block';
    loadSavedPosts();
}

function closeSavedItems() {
    document.getElementById('saved-items-screen').style.display = 'none';
}

async function loadSavedPosts() {
    const container = document.getElementById('saved-posts-container');
    container.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--text-muted);">Loading your saved posts...</div>';

    // .         
    if (!currentUser || !currentUserData.savedPosts || currentUserData.savedPosts.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding: 60px 20px; color: var(--text-muted);">
                <span class="material-symbols-outlined" style="font-size: 60px; margin-bottom:15px; opacity:0.5; color: var(--accent);">bookmark_border</span>
                <h3 style="margin-bottom: 5px; color: var(--text);">No saved items yet</h3>
                <p style="font-size:14px;">Click 'Interested' on any post to save it here for later.</p>
            </div>
        `;
        return;
    }

    try {
        // .         
        const postPromises = currentUserData.savedPosts.map(id => db.collection('posts').doc(id).get());
        const postSnaps = await Promise.all(postPromises);
        
        let html = '';
        
        // .    HTML  
        for (let snap of postSnaps) {
            if (snap.exists) {
                const p = snap.data();
                p.id = snap.id;
                
                //    
                let uName = 'Unknown User';
                let uAv = '<span class="material-symbols-outlined" style="font-size:24px; color:white;">person</span>';
                let uVer = false;
                
                if (allUsersCache) {
                    const u = allUsersCache.find(user => user.id === p.uid);
                    if (u) {
                        uName = u.name;
                        uAv = u.avatar ? `<img src="${u.avatar}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">` : uAv;
                        uVer = u.verified;
                    }
                }
                
                //   
                html += buildPostCardHTML(p, uAv, uName, uVer);
            }
        }

        if (html === '') {
            container.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--text-muted);">Some saved posts are no longer available.</div>';
        } else {
            container.innerHTML = html;
        }
    } catch (error) {
        console.error("Error loading saved posts:", error);
        container.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--danger);">Failed to load saved posts. Please try again.</div>';
    }
}
// ==========================================
//  UNSAVE POST LOGIC
// ==========================================
async function unsavePost(postId) {
    closeAllDropdowns();
    if (!currentUser || !currentUserData.savedPosts) return;

    // .     
    currentUserData.savedPosts = currentUserData.savedPosts.filter(id => id !== postId);
    
    try {
        // .     
        await db.collection('users').doc(currentUser.uid).update({
            savedPosts: firebase.firestore.FieldValue.arrayRemove(postId)
        });
        showToast("Post removed from saved items!");
        
        // .  :   'Saved Items'   ,          
        const savedScreen = document.getElementById('saved-items-screen');
        if (savedScreen && savedScreen.style.display !== 'none') {
            loadSavedPosts();
        }
    } catch(e) {
        console.error("Error unsaving post:", e);
        showToast("Failed to remove post.");
    }
}
// ==========================================
//  CHAT WALLPAPER SYSTEM LOGIC
// ==========================================
function openWallpaperPicker() {
    closeQuickProfile(); //    
    document.getElementById('wallpaper-modal').classList.add('open');
}

function closeWallpaperPicker() {
    document.getElementById('wallpaper-modal').classList.remove('open');
}

async function setChatWallpaper(color) {
    if (!currentUser || !currentChatId) return;

    // .   
    if (!currentUserData.chatWallpapers) currentUserData.chatWallpapers = {};
    currentUserData.chatWallpapers[currentChatId] = color;

    // . UI       (  )
    const chatScreenEl = document.getElementById('chat-screen');
    const chatMessagesEl = document.getElementById('chat-messages');
    const wallpaperBg = document.getElementById('chat-wallpaper-bg');
    
    if (color === 'default') {
        if(wallpaperBg) wallpaperBg.style.display = 'none';
        chatScreenEl.style.background = '';
        chatMessagesEl.style.background = '';
    } else {
        if(wallpaperBg) {
            wallpaperBg.style.display = 'block';
            wallpaperBg.style.background = color;
        }
        chatScreenEl.style.background = 'transparent';
        chatMessagesEl.style.background = 'transparent';
    }

    // .     (     )
    try {
        await db.collection('users').doc(currentUser.uid).set({
            chatWallpapers: {
                [currentChatId]: color === 'default' ? firebase.firestore.FieldValue.delete() : color
            }
        }, { merge: true });
        
        showToast("Wallpaper updated!");
    } catch(e) {
        showToast("Failed to update wallpaper");
    }
    
    closeWallpaperPicker(); //   
}
// ==========================================
//  ADVANCED GROUP CHAT LOGIC (Members, Add, Remove, Leave)
// ==========================================
let activeGroupData = null;
let activeGroupId = null;
let newMembersToGroup = [];

async function openGroupInfoModal(groupId) {
    activeGroupId = groupId;
    document.getElementById('group-info-modal').classList.add('open');
    document.getElementById('add-group-member-ui').style.display = 'none';
    await loadGroupMembers();
}

function closeGroupInfoModal() {
    document.getElementById('group-info-modal').classList.remove('open');
    activeGroupId = null;
    activeGroupData = null;
}

async function loadGroupMembers() {
    const list = document.getElementById('group-member-list');
    list.innerHTML = '<div class="loading"><span class="material-symbols-outlined">autorenew</span> Loading members...</div>';
    
    try {
        const doc = await db.collection('chats').doc(activeGroupId).get();
        if(!doc.exists) return;
        activeGroupData = doc.data();
        
        document.getElementById('group-info-name').textContent = activeGroupData.groupName || 'Group Info';
        document.getElementById('group-info-avatar').innerHTML = activeGroupData.groupAvatar ? `<img src="${activeGroupData.groupAvatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : `<span class="material-symbols-outlined" style="font-size:40px; color:white;">groups</span>`;
        document.getElementById('group-member-count').textContent = (activeGroupData.members || []).length;
        
        const members = activeGroupData.members || [];
        const admins = activeGroupData.admins || [activeGroupData.admin]; //  3. Multiple Admins Support
        const isMeAdmin = admins.includes(currentUser.uid);
        
        //     
        document.getElementById('group-avatar-edit-btn').style.display = isMeAdmin ? 'flex' : 'none';
        document.getElementById('group-name-edit-btn').style.display = isMeAdmin ? 'block' : 'none';

        let html = '';
        if(!allUsersCache) await fetchAllUsers();
        
        members.forEach(uid => {
            const u = allUsersCache.find(user => user.id === uid) || { name: 'Unknown User', avatar: '' };
            const safeName = escapeHTML(u.name);
            const avHtml = u.avatar ? `<img src="${u.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:var(--gradient);color:#fff;font-weight:bold;">${safeName[0].toUpperCase()}</div>`;
            
            const isUserAdmin = admins.includes(uid);
            let roleBadge = '';
            if(isUserAdmin) {
                roleBadge = '<span style="font-size:10px; background:var(--accent); color:white; padding:3px 8px; border-radius:12px; margin-left:8px; font-weight:bold;">Admin </span>';
            } else if (uid === currentUser.uid) {
                roleBadge = '<span style="font-size:10px; background:var(--surface-2); color:var(--text); padding:3px 8px; border-radius:12px; margin-left:8px; border: 1px solid var(--border);">You</span>';
            }

            let adminBtns = '';
            if(isMeAdmin && uid !== currentUser.uid) {
                if(!isUserAdmin) {
                    adminBtns += `<button class="btn-outline" style="padding:6px 10px; font-size:11px; margin:0 4px 0 0;" onclick="makeGroupAdmin('${uid}', '${safeName}')">Make Admin</button>`;
                } else if(uid !== activeGroupData.admin) { 
                    // Main creator cannot be demoted
                    adminBtns += `<button class="btn-outline" style="padding:6px 10px; font-size:11px; margin:0 4px 0 0; color:#f59e0b; border-color:#f59e0b;" onclick="removeGroupAdmin('${uid}', '${safeName}')">Demote</button>`;
                }
                adminBtns += `<button class="btn-outline" style="padding:6px 10px; font-size:11px; border-color:var(--danger); color:var(--danger); margin:0;" onclick="removeGroupMember('${uid}', '${safeName}')">Remove</button>`;
            }
            
            html += `
            <div class="msg-item" style="margin: 0; padding: 12px; cursor:default;">
                <div class="avatar sm">${avHtml}</div>
                <div class="msg-info" style="margin-left:12px; display:flex; align-items:center;">
                    <div class="msg-name" style="margin:0;">${safeName} ${roleBadge}</div>
                </div>
                <div style="display:flex;">${adminBtns}</div>
            </div>`;
        });
        
        list.innerHTML = html;
    } catch(e) {
        list.innerHTML = '<div class="empty-feed">Failed to load members</div>';
    }
}

async function removeGroupMember(uid, name) {
    if(!confirm(`Are you sure you want to remove ${name} from the group?`)) return;
    try {
        //     
        await db.collection('chats').doc(activeGroupId).update({
            members: firebase.firestore.FieldValue.arrayRemove(uid),
            lastMsg: `${name} was removed by Admin`,
            lastAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast("Member removed!");
        loadGroupMembers(); //  
    } catch(e) { showToast("Error removing member"); }
}

async function leaveCurrentGroup() {
    if(!confirm("Are you sure you want to leave this group? You will lose access to all messages.")) return;
    try {
        const safeName = currentUserData.name || 'A member';
        await db.collection('chats').doc(activeGroupId).update({
            members: firebase.firestore.FieldValue.arrayRemove(currentUser.uid),
            lastMsg: `${safeName} left the group`,
            lastAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast("You left the group");
        closeGroupInfoModal();
        closeChat(); 
    } catch(e) { showToast("Error leaving group"); }
}

async function openAddGroupMemberUI() {
    const ui = document.getElementById('add-group-member-ui');
    const list = document.getElementById('add-group-member-list');
    ui.style.display = 'block';
    newMembersToGroup = [];
    
    const friends = currentUserData.friends || [];
    const currentMembers = activeGroupData.members || [];
    
    //          
    const availableFriends = friends.filter(fId => !currentMembers.includes(fId));
    
    if(availableFriends.length === 0) {
        list.innerHTML = '<div style="font-size:13px; color:var(--danger); text-align:center; padding: 10px;">No new friends available to add.</div>';
        return;
    }
    
    list.innerHTML = '<div class="loading"><span class="material-symbols-outlined">autorenew</span> Loading friends...</div>';
    if(!allUsersCache) await fetchAllUsers();
    
    let html = '';
    availableFriends.forEach(uid => {
        const u = allUsersCache.find(user => user.id === uid) || { name: 'Unknown User', avatar: '' };
        const safeName = escapeHTML(u.name);
        const avHtml = u.avatar ? `<img src="${u.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:var(--gradient);color:#fff;font-weight:bold;">${safeName[0].toUpperCase()}</div>`;
        
        html += `
        <div class="msg-item" onclick="toggleNewGroupMember('${uid}', this)" style="margin: 0; padding: 10px; cursor: pointer; border-radius: 8px;">
            <div class="avatar sm" style="width:36px; height:36px;">${avHtml}</div>
            <div class="msg-info" style="margin-left:12px; font-size:14px; font-weight:bold;">${safeName}</div>
            <input type="checkbox" value="${uid}" style="pointer-events:none; width:18px; height:18px; accent-color: var(--accent);">
        </div>`;
    });
    list.innerHTML = html;
}

function toggleNewGroupMember(uid, element) {
    const checkbox = element.querySelector('input[type="checkbox"]');
    if(newMembersToGroup.includes(uid)) {
        newMembersToGroup = newMembersToGroup.filter(id => id !== uid);
        checkbox.checked = false;
    } else {
        newMembersToGroup.push(uid);
        checkbox.checked = true;
    }
}

async function confirmAddGroupMembers() {
    if(newMembersToGroup.length === 0) {
        showToast("Select at least one friend to add!");
        return;
    }
    const btn = document.querySelector('#add-group-member-ui button');
    const originalText = btn.textContent;
    btn.textContent = "Adding...";
    btn.disabled = true;
    
    try {
        //       
        await db.collection('chats').doc(activeGroupId).update({
            members: firebase.firestore.FieldValue.arrayUnion(...newMembersToGroup),
            lastMsg: `${currentUserData.name} added new members`,
            lastAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast("Members added successfully!");
        document.getElementById('add-group-member-ui').style.display = 'none';
        loadGroupMembers(); //    
    } catch(e) {
        showToast("Error adding members");
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}
// ==========================================
//  NEW GROUP FEATURES (Edit, Admins, Media, Pin, Mention)
// ==========================================

async function updateGroupAvatar(input) {
    const file = input.files[0];
    if(!file || !activeGroupId) return;
    showToast('Uploading group photo...');
    try {
        const url = await uploadToCloudinary(file, false);
        await db.collection('chats').doc(activeGroupId).update({
            groupAvatar: url,
            lastMsg: `${currentUserData.name} updated the group photo`,
            lastAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        activeGroupData.groupAvatar = url;
        document.getElementById('group-info-avatar').innerHTML = `<img src="${url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
        showToast('Group photo updated!');
        document.getElementById('chat-avatar').innerHTML = `<img src="${url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
    } catch(e) { showToast('Upload failed'); }
}

async function editGroupName() {
    const newName = prompt("Enter new group name:", activeGroupData.groupName);
    if(!newName || newName.trim() === "" || !activeGroupId) return;
    try {
        await db.collection('chats').doc(activeGroupId).update({
            groupName: newName.trim(),
            lastMsg: `${currentUserData.name} changed the group name`,
            lastAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        activeGroupData.groupName = newName.trim();
        document.getElementById('group-info-name').textContent = newName.trim();
        document.getElementById('chat-name-display').textContent = newName.trim();
        showToast('Group name updated!');
    } catch(e) { showToast('Update failed'); }
}

async function makeGroupAdmin(uid, name) {
    if(!confirm(`Make ${name} an admin?`)) return;
    try {
        await db.collection('chats').doc(activeGroupId).update({
            admins: firebase.firestore.FieldValue.arrayUnion(uid)
        });
        showToast(`${name} is now an admin!`);
        loadGroupMembers();
    } catch(e) { showToast('Failed to make admin'); }
}

async function removeGroupAdmin(uid, name) {
    if(!confirm(`Remove ${name} from admins?`)) return;
    try {
        await db.collection('chats').doc(activeGroupId).update({
            admins: firebase.firestore.FieldValue.arrayRemove(uid)
        });
        showToast(`${name} is no longer an admin!`);
        loadGroupMembers();
    } catch(e) { showToast('Failed to remove admin'); }
}

async function toggleGroupMedia() {
    const mediaCont = document.getElementById('group-shared-media');
    if(mediaCont.style.display === 'block') {
        mediaCont.style.display = 'none';
        return;
    }
    mediaCont.style.display = 'block';
    const grid = document.getElementById('group-media-grid');
    grid.innerHTML = '<div class="loading" style="grid-column:1/-1;"><span class="material-symbols-outlined">autorenew</span> Loading...</div>';
    try {
        const snap = await db.collection('chats').doc(activeGroupId).collection('messages').where('imageUrl', '!=', '').orderBy('createdAt', 'desc').limit(20).get();
        let html = '';
        snap.forEach(d => {
            const url = d.data().imageUrl;
            if(url) html += `<img src="${escapeHTML(url)}" style="width:100%; aspect-ratio:1; object-fit:cover; border-radius:8px; cursor:pointer;" onclick="openImageZoom('${escapeHTML(url)}')">`;
        });
        grid.innerHTML = html || '<div style="grid-column:1/-1; text-align:center; font-size:12px; color:var(--text-muted);">No shared media</div>';
    } catch(e) { grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; font-size:12px; color:var(--danger);">Error loading media</div>'; }
}

//      (Event Listener)
document.addEventListener('DOMContentLoaded', () => {
  const chatInputBox = document.getElementById('chat-input');
  if (chatInputBox) {
    chatInputBox.addEventListener('input', (e) => {
      if(currentChatOtherUid === 'group') {
        handleMentionInput(e.target, 'chat-mention-dropdown', e);
      }
    });
    chatInputBox.addEventListener('keydown', (e) => {
      if(currentChatOtherUid === 'group') {
        handleMentionKeydown(e, 'chat-mention-dropdown');
      }
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#chat-mention-dropdown') && e.target !== chatInputBox) {
        const dropdown = document.getElementById('chat-mention-dropdown');
        if (dropdown) hideMentionDropdown(dropdown);
      }
    });
  }
});
//  Click to Scroll and Highlight Message
function scrollToMessage(msgId) {
    const targetMsg = document.querySelector(`.chat-bubble-wrapper[data-msgid="${msgId}"] .chat-bubble`);
    if(targetMsg) {
        //   
        targetMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        //   
        const originalBg = targetMsg.style.background;
        const originalShadow = targetMsg.style.boxShadow;
        
        targetMsg.style.background = 'var(--accent-glow)';
        targetMsg.style.boxShadow = '0 0 15px var(--accent)';
        targetMsg.style.transition = 'all 0.5s ease';
        
        setTimeout(() => {
            targetMsg.style.background = originalBg;
            targetMsg.style.boxShadow = originalShadow;
        }, 1500);
    } else {
        showToast("Message is too old or has been deleted.");
    }
}

//  Advanced Privacy Logic
let isAdvancedPrivacyOn = false;

function openAdvancedPrivacy() {
    const menu = document.getElementById('chat-delete-menu');
    if(menu) menu.style.display = 'none'; 
    document.getElementById('advanced-privacy-modal').classList.add('open');
}

function closeAdvancedPrivacy() {
    document.getElementById('advanced-privacy-modal').classList.remove('open');
}

//  Advanced Privacy Logic (Updated & Fixed)
async function toggleAdvancedPrivacy() {
    if (!currentChatId) return;
    
    const toggle = document.getElementById('advanced-privacy-toggle');
    //      
    const isCurrentlyOn = toggle.classList.contains('active');
    const newStatus = !isCurrentlyOn;

    try {
        // .    
        await db.collection('chats').doc(currentChatId).set({
            advancedPrivacy: newStatus
        }, { merge: true });

        // .     
        if (newStatus) {
            toggle.classList.add('active');
            showToast(" Advanced Privacy ON");
        } else {
            toggle.classList.remove('active');
            showToast(" Advanced Privacy OFF");
        }

        // .     / 
        const chatMessagesEl = document.getElementById('chat-messages');
        if (chatMessagesEl) {
            if (newStatus) {
                chatMessagesEl.classList.add('privacy-restricted');
            } else {
                chatMessagesEl.classList.remove('privacy-restricted');
            }
        }

    } catch (e) {
        console.error("Privacy update failed:", e);
        showToast("Failed to update privacy settings");
    }
}
// ===== NESTED ACTIVITY SYSTEM DATA & LOGIC =====
const activityCategories = {
    'happy': {
        title: 'Feeling Happy',
        icon: 'mood',
        color: '#f59e0b',
        items: [
            { text: 'feeling happy', icon: 'sentiment_satisfied_alt' },
            { text: 'feeling excited', icon: 'stars' },
            { text: 'feeling blessed', icon: 'self_improvement' },
            { text: 'feeling grateful', icon: 'favorite' },
            { text: 'feeling energetic', icon: 'bolt' },
            { text: 'feeling silly', icon: 'emoji_emotions' }
        ]
    },
    'celebrating': {
        title: 'Celebrating',
        icon: 'celebration',
        color: '#e91e63',
        items: [
            { text: 'celebrating birthday', icon: 'cake' },
            { text: 'celebrating anniversary', icon: 'champagne' },
            { text: 'celebrating achievement', icon: 'trophy' },
            { text: 'celebrating new job', icon: 'work' },
            { text: 'celebrating graduation', icon: 'school' },
            { text: 'celebrating festival', icon: 'festival' }
        ]
    },
    'traveling': {
        title: 'Traveling',
        icon: 'flight_takeoff',
        color: '#3b82f6',
        items: [
            { text: 'traveling to beach', icon: 'beach_access' },
            { text: 'traveling to mountains', icon: 'landscape' },
            { text: 'exploring a city', icon: 'location_city' },
            { text: 'on a road trip', icon: 'directions_car' },
            { text: 'vacationing', icon: 'umbrella' },
            { text: 'going on adventure', icon: 'hiking' }
        ]
    },
    'watching': {
        title: 'Watching',
        icon: 'movie',
        color: '#8b5cf6',
        items: [
            { text: 'watching a movie', icon: 'local_movies' },
            { text: 'binge-watching series', icon: 'tv' },
            { text: 'watching sports', icon: 'sports_soccer' },
            { text: 'watching live concert', icon: 'concert' },
            { text: 'watching sunset', icon: 'wb_twilight' },
            { text: 'people watching', icon: 'visibility' }
        ]
    },
    'listening': {
        title: 'Listening',
        icon: 'headphones',
        color: '#22c55e',
        items: [
            { text: 'listening to music', icon: 'music_note' },
            { text: 'listening to podcast', icon: 'podcasts' },
            { text: 'listening to audiobook', icon: 'book' },
            { text: 'listening to rain', icon: 'rainy' },
            { text: 'listening to nature', icon: 'park' },
            { text: 'jamming to beats', icon: 'graphic_eq' }
        ]
    },
    'playing': {
        title: 'Playing',
        icon: 'sports_esports',
        color: '#ef4444',
        items: [
            { text: 'playing video games', icon: 'videogame_asset' },
            { text: 'playing football', icon: 'sports_soccer' },
            { text: 'playing cricket', icon: 'sports_cricket' },
            { text: 'playing guitar', icon: 'guitar' },
            { text: 'playing with pets', icon: 'pets' },
            { text: 'playing board games', icon: 'casino' }
        ]
    },
    'eating': {
        title: 'Eating',
        icon: 'restaurant',
        color: '#f97316',
        items: [
            { text: 'eating delicious food', icon: 'fastfood' },
            { text: 'trying new cuisine', icon: 'ramen_dining' },
            { text: 'having coffee', icon: 'coffee' },
            { text: 'eating dessert', icon: 'icecream' },
            { text: 'cooking at home', icon: 'kitchen' },
            { text: 'having a feast', icon: 'dinner_dining' }
        ]
    },
    'loved': {
        title: 'Feeling Loved',
        icon: 'favorite',
        color: '#ef4444',
        items: [
            { text: 'feeling loved', icon: 'favorite' },
            { text: 'spending time with family', icon: 'family_restroom' },
            { text: 'hanging with friends', icon: 'groups' },
            { text: 'romantic date night', icon: 'wine_bar' },
            { text: 'cuddling', icon: 'bed' },
            { text: 'receiving flowers', icon: 'local_florist' }
        ]
    }
};

// Render Main Categories
function renderMainActivities() {
    const container = document.getElementById('activity-main-view');
    if(!container) return;
    
    let html = '';
    for(let key in activityCategories) {
        const cat = activityCategories[key];
        html += `
        <div class="activity-item" onclick="openActivitySubCategory('${key}')">
            <span class="material-symbols-outlined" style="color:${cat.color}">${cat.icon}</span> 
            ${cat.title.replace('Feeling ', '').replace('to ', '')}
        </div>`;
    }
    container.innerHTML = html;
}

// Open Sub Category
function openActivitySubCategory(key) {
    const cat = activityCategories[key];
    document.getElementById('activity-modal-title').textContent = cat.title;
    document.getElementById('activity-main-view').style.display = 'none';
    document.getElementById('activity-sub-view').style.display = 'flex';
    
    const subContainer = document.getElementById('activity-sub-container');
    let html = '';
    cat.items.forEach(item => {
        html += `
        <div class="activity-sub-item" onclick="selectActivity('${item.icon}', '${item.text}')">
            <span class="material-symbols-outlined" style="color:${cat.color}">${item.icon}</span> 
            ${item.text.charAt(0).toUpperCase() + item.text.slice(1)}
        </div>`;
    });
    subContainer.innerHTML = html;
}

// Go Back to Main List
function showMainActivities() {
    document.getElementById('activity-modal-title').textContent = 'How are you feeling?';
    document.getElementById('activity-sub-view').style.display = 'none';
    document.getElementById('activity-main-view').style.display = 'grid';
}

// Initialize when DOM loads
document.addEventListener('DOMContentLoaded', () => {
    renderMainActivities();
});
// ==========================================
//  PRIVATE CHAT SYSTEM LOGIC
// ==========================================

// .      ""    
async function cleanupPrivateChatsOnLoad() {
    if (!currentUser) return;
    try {
        //             
        const activePrivateChats = currentUserData.activePrivateChats || [];
        
        if (activePrivateChats.length > 0) {
            console.log(" Cleaning up", activePrivateChats.length, "private chat sessions...");
            
            const batch = db.batch();
            let cleanedCount = 0;

            for (const chatId of activePrivateChats) {
                //       
                const messagesRef = db.collection('chats').doc(chatId).collection('messages');
                const snap = await messagesRef.get();
                
                //        
                snap.forEach(doc => {
                    batch.delete(doc.ref);
                    cleanedCount++;
                });
            }

            //     
            if (cleanedCount > 0) {
                await batch.commit();
                console.log(` Successfully deleted ${cleanedCount} private messages.`);
            }

            // .   "Active Private Chats"         
            await db.collection('users').doc(currentUser.uid).update({
                activePrivateChats: [] 
            });
        }
    } catch (e) {
        console.error("Error cleaning private chats:", e);
    }
}

// . Quick Profile   Private Chat   
async function togglePrivateChatFromQP() {
    if (!currentChatId) return;
    
    const btnText = document.getElementById('qp-private-chat-text');
    const btn = document.getElementById('qp-private-chat-btn');
    
    //          
    const isCurrentlyPrivate = currentUserData.activePrivateChats?.includes(currentChatId);
    
    if (isCurrentlyPrivate) {
        // --- MODE OFF:     ---
        if(!confirm("Turning OFF Private Chat will PERMANENTLY delete all messages in this chat from everyone's device and Firebase. Continue?")) return;
        
        showToast(" Wiping private messages...");
        
        try {
            // )   
            const messagesRef = db.collection('chats').doc(currentChatId).collection('messages');
            const snap = await messagesRef.get();
            const batch = db.batch();
            snap.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            
            // )       
            await db.collection('users').doc(currentUser.uid).update({
                activePrivateChats: firebase.firestore.FieldValue.arrayRemove(currentChatId)
            });
            
            // ) UI 
            currentUserData.activePrivateChats = currentUserData.activePrivateChats.filter(id => id !== currentChatId);
            updatePrivateChatUI();
            showToast("Private Chat OFF. All messages deleted.");
            
            // )   
            if(document.getElementById('chat-screen').classList.contains('open')) {
                openChat(currentChatId, currentChatOtherUid, document.getElementById('chat-name-display').textContent, '');
            }
            
        } catch(e) {
            showToast("Failed to clear private chat");
            console.error(e);
        }
        
    } else {
        // --- MODE ON:     ---
        try {
            await db.collection('users').doc(currentUser.uid).update({
                activePrivateChats: firebase.firestore.FieldValue.arrayUnion(currentChatId)
            });
            
            currentUserData.activePrivateChats = [...(currentUserData.activePrivateChats || []), currentChatId];
            updatePrivateChatUI();
            showToast(" Private Chat ON. Messages will vanish when you leave.");
        } catch(e) {
            showToast("Failed to enable Private Chat");
        }
    }
    
    closeQuickProfile();
}

// .       
function updatePrivateChatUI() {
    const btnText = document.getElementById('qp-private-chat-text');
    const btn = document.getElementById('qp-private-chat-btn');
    if (!btnText || !btn) return;

    const isPrivate = currentUserData.activePrivateChats?.includes(currentChatId);
    
    if (isPrivate) {
        btnText.textContent = "Private Chat ON";
        btn.style.background = "var(--accent-glow)";
        btn.style.color = "var(--accent)";
        btn.style.border = "1px solid var(--accent)";
    } else {
        btnText.textContent = "Private Chat OFF";
        btn.style.background = "var(--surface-2)";
        btn.style.color = "var(--text)";
        btn.style.border = "none";
    }
}
// ==========================================
//  FIX: QUICK REPLY POPUP STICKY & SEND LOGIC
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    //        "" 
    const observer = new MutationObserver(() => {
        const activePopup = document.querySelector('.msg-popup');
        if (activePopup) {
            const input = activePopup.querySelector('input');
            const sendBtn = activePopup.querySelector('button');
            
            if (input && !input.dataset.fixed) {
                // .      
                input.onclick = (e) => e.stopPropagation();
                input.onmousedown = (e) => e.stopPropagation();
                input.ontouchstart = (e) => e.stopPropagation();
                input.dataset.fixed = "true";
                
                // .       
                setTimeout(() => input.focus(), 100);
            }

            // .      
            if (sendBtn && !sendBtn.dataset.fixed) {
                sendBtn.onclick = (e) => {
                    e.stopPropagation(); //    
                    const text = input.value.trim();
                    if (!text || !currentUser) return;
                    
                    //         
                    const popupId = activePopup.id.replace('popup-', '');
                    const parts = popupId.split('_');
                    const otherUid = parts[0] === currentUser.uid ? parts[1] : parts[0];
                    
                    //  
                    db.collection('chats').doc(popupId).collection('messages').add({
                        uid: currentUser.uid,
                        senderName: currentUserData.name || 'User',
                        text: text,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    
                    db.collection('chats').doc(popupId).set({
                        lastMsg: text,
                        lastAt: firebase.firestore.FieldValue.serverTimestamp(),
                        lastSender: currentUser.uid,
                        isRead: false
                    }, { merge: true });
                    
                    showToast("Reply sent!");
                    activePopup.remove(); //     
                };
                sendBtn.dataset.fixed = "true";
            }
        }
    });
    
    //    
    observer.observe(document.body, { childList: true, subtree: true });
});
// ==========================================
// ADVANCED ACTIVE TIME TRACKING SYSTEM V2.0
// ==========================================

// 1. Smart Tracking with Auto-Reset Logic
let activeTimeTracker = setInterval(() => {
    if (!currentUser) return; 
    
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    
    let timeData = JSON.parse(localStorage.getItem('gochat_active_time_v2') || '{}');
    
    // Update today's seconds
    timeData[todayStr] = (timeData[todayStr] || 0) + 1;
    
    // AUTO-RESET: Keep ONLY last 7 days (168 hours)
    const cutoffDate = new Date(now);
    cutoffDate.setDate(cutoffDate.getDate() - 7); 
    const cutoffStr = cutoffDate.toISOString().split('T')[0];
    
    // Delete any data older than 7 days immediately
    for (let date in timeData) {
        if (date < cutoffStr) delete timeData[date];
    }
    
    localStorage.setItem('gochat_active_time_v2', JSON.stringify(timeData));
}, 1000); 

// 2. Modal Controls
function openActiveTimeModal() {
    document.getElementById('active-time-modal').classList.add('open');
    renderAdvancedTimeChart();
}

function closeActiveTimeModal() {
    document.getElementById('active-time-modal').classList.remove('open');
}

// 3. Enhanced Chart Rendering
function renderAdvancedTimeChart() {
    const container = document.getElementById('active-time-chart');
    const summaryEl = document.getElementById('total-time-summary');
    const timeData = JSON.parse(localStorage.getItem('gochat_active_time_v2') || '{}');
    
    let html = '';
    let totalSeconds = 0;
    const now = new Date();
    
    // Loop through exactly last 7 days
    for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        
        // Get day name and formatted date
        const dayName = i === 0 ? 'Today' : (i === 1 ? 'Yesterday' : d.toLocaleDateString('en-US', { weekday: 'short' }));
        const fullDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        
        const seconds = timeData[dateStr] || 0;
        totalSeconds += seconds;
        
        // Convert to readable format
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const timeString = seconds > 0 ? `${hours}h ${mins}m` : '0m';
        
        // Calculate bar percentage (Max 8 hours = 100% width)
        const maxDailySeconds = 8 * 3600; 
        const percentage = Math.min((seconds / maxDailySeconds) * 100, 100);
        
        // Styling for Today vs Past Days
        const isToday = i === 0;
        const bgStyle = isToday 
            ? 'background: var(--accent-glow); border-color: var(--accent); box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);' 
            : 'background: var(--surface-2); border: 1px solid var(--border);';
            
        const textColor = isToday ? 'var(--accent)' : 'var(--text)';
        const barColor = isToday ? 'var(--accent)' : 'var(--text-secondary)';
        
        html += `
        <div style="${bgStyle} padding: 14px 16px; border-radius: var(--radius-md); display: flex; align-items: center; gap: 14px; transition: all 0.3s ease;">
            <div style="width: 60px; text-align: left;">
                <div style="font-weight: 700; font-size: 14px; color: ${textColor};">${dayName}</div>
                <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">${fullDate}</div>
            </div>
            
            <div style="flex: 1; height: 8px; background: var(--border); border-radius: 10px; overflow: hidden;">
                <div style="height: 100%; width: ${percentage}%; background: ${barColor}; border-radius: 10px; transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);"></div>
            </div>
            
            <div style="font-weight: 700; font-size: 14px; color: ${textColor}; min-width: 55px; text-align: right;">
                ${timeString}
            </div>
        </div>`;
    }
    
    // Update Total Summary Card
    const totalHours = Math.floor(totalSeconds / 3600);
    const totalMins = Math.floor((totalSeconds % 3600) / 60);
    summaryEl.querySelector('div:last-child').textContent = `${totalHours}h ${totalMins}m`;
    
    container.innerHTML = html;
}
// ==========================================
//  SUPPORT PAGE LOGIC
// ==========================================
function openSupportPage() {
    document.getElementById('support-screen').style.display = 'flex';
}

function closeSupportPage() {
    document.getElementById('support-screen').style.display = 'none';
}
// ==========================================
//  CHAT PRIVACY SYSTEM LOGIC
// ==========================================

// .    
function openChatPrivacyPage() {
    document.getElementById('chat-privacy-screen').style.display = 'flex';
    
    //    
    const currentSetting = currentUserData.chatPrivacy || 'public';
    if(currentSetting === 'following') {
        document.getElementById('opt-following').checked = true;
    } else {
        document.getElementById('opt-public').checked = true;
    }
}

// .    
function closeChatPrivacyPage() {
    document.getElementById('chat-privacy-screen').style.display = 'none';
}

// .    
async function saveChatPrivacy() {
    const selectedOption = document.querySelector('input[name="chat-privacy"]:checked').value;
    
    showToast("Saving privacy settings...");
    
    try {
        await db.collection('users').doc(currentUser.uid).update({
            chatPrivacy: selectedOption
        });
        
        //   
        currentUserData.chatPrivacy = selectedOption;
        
        showToast(`Chat privacy set to: ${selectedOption === 'public' ? 'Public' : 'Those I follow'}`);
        closeChatPrivacyPage();
    } catch(e) {
        showToast("Failed to save settings");
        console.error(e);
    }
}
// ==========================================
//  MENU SETTINGS SEARCH LOGIC
// ==========================================
function filterMenuSettings(query) {
    const menuContainer = document.querySelector('#main-menu-screen .settings-list-item'); //   (Elite GoChat)
    if (!menuContainer) return;
    
    //     (Log out )
    const allItems = Array.from(document.querySelectorAll('#main-menu-screen .settings-list-item'));
    const lowerQuery = query.toLowerCase().trim();
    
    //     ,  
    if (lowerQuery === '') {
        allItems.forEach(item => item.style.display = 'flex');
        // - (Settings & Privacy)     
        const subMenu = document.getElementById('settings-sub-menu');
        if(subMenu) subMenu.style.display = 'none'; 
        return;
    }

    //  
    let foundAny = false;
    allItems.forEach(item => {
        const text = item.innerText.toLowerCase();
        if (text.includes(lowerQuery)) {
            item.style.display = 'flex';
            foundAny = true;
            
            //  "Settings & Privacy"      ,  -  
            if (item.closest('#settings-sub-menu') && document.getElementById('settings-sub-menu')) {
                document.getElementById('settings-sub-menu').style.display = 'flex';
                document.getElementById('settings-arrow').textContent = 'expand_less';
            }
        } else {
            item.style.display = 'none';
        }
    });

    //      ,    ()
    if (!foundAny) {
        //     "No results found"    
    }
}
// ==========================================
//  ELITE APP SYSTEM V2.0
// ==========================================
let currentAppStep = 1;

function openEliteGoChat() {
    document.getElementById('elite-app-modal').style.display = 'flex';
    resetAppForm();
}

function closeEliteAppModal() {
    document.getElementById('elite-app-modal').style.display = 'none';
}

function nextAppStep(step) {
    // Validation for Step 3
    if(step === 4) {
        const name = document.getElementById('app-name').value.trim();
        const username = document.getElementById('app-username').value.trim();
        const email = document.getElementById('app-email').value.trim();
        const wp = document.getElementById('app-wp').value.trim();
        
        if(!name || !username || !email || !wp) {
            showToast(" Please fill all required fields!");
            return;
        }
        if(!email.includes('@') || !email.includes('.')) {
            showToast(" Please enter a valid email address!");
            return;
        }
    }

    // Update UI
    for(let i=1; i<=4; i++) {
        document.getElementById(`app-step-${i}`).style.display = (i === step) ? 'block' : 'none';
    }
    document.getElementById('app-progress-bar').style.width = `${step * 25}%`;
    currentAppStep = step;
}

function resetAppForm() {
    nextAppStep(1);
    ['app-name', 'app-username', 'app-email', 'app-wp'].forEach(id => document.getElementById(id).value = '');
    document.querySelectorAll('#elite-app-modal input[type="file"]').forEach(el => {
        el.value = ''; 
        const parent = el.parentElement;
        parent.style.borderColor = 'var(--border)';
        parent.style.color = 'var(--text-secondary)';
        const icon = parent.querySelector('.material-symbols-outlined');
        if(icon && icon.textContent !== 'upload_file' && icon.textContent !== 'add_a_photo') {
             // Reset icons based on context
             if(parent.id.includes('id')) icon.textContent = 'upload_file';
             else icon.textContent = 'add_a_photo';
        }
    });
}

async function submitEliteApplication() {
    const facePhoto = document.getElementById('app-face-photo').files[0];
    if(!facePhoto) {
        showToast(" Please upload your selfie to finish!");
        return;
    }

    showToast(" Preparing application...");
    closeEliteAppModal();

    const name = document.getElementById('app-name').value.trim();
    const username = document.getElementById('app-username').value.trim();
    const email = document.getElementById('app-email').value.trim();
    const wpNumber = document.getElementById('app-wp').value.trim();
    
    // Formatted Message for WhatsApp
    let msg = `* NEW ELITE APPLICATION *\n\n`;
    msg += ` *Name:* ${name}\n`;
    msg += ` *Username:* @${username}\n`;
    msg += ` *Email:* ${email}\n`;
    msg += ` *WhatsApp:* ${wpNumber}\n`;
    msg += ` *Date:* ${new Date().toLocaleString()}\n\n`;
    msg += `_Please verify within 72 hours._`;

    const targetPhone = "8801948303440"; //  
    const waLink = `https://wa.me/${targetPhone}?text=${encodeURIComponent(msg)}`;

    window.open(waLink, '_blank');
    showToast(" Application sent to WhatsApp!");
}
// ==========================================
//  FIXED & MODERN USERNAME SETTINGS V3.0
// ==========================================

function openUsernameSettings() {
    openProfileEdit();
    
    // .  :       
    const existingWrapper = document.getElementById('modern-username-wrapper');
    if(existingWrapper) existingWrapper.remove();
    
    const existingMsg = document.querySelector('.username-status-msg');
    if(existingMsg) existingMsg.remove();

    const editScreen = document.getElementById('edit-profile-screen');
    const nameInputContainer = document.getElementById('edit-name')?.parentElement;
    
    if(editScreen && nameInputContainer) {
        // .     (   )
        const wrapper = document.createElement('div');
        wrapper.id = 'modern-username-wrapper';
        wrapper.style.marginBottom = '16px';
        
        wrapper.innerHTML = `
            <label style="font-size:12px; font-weight:700; color:var(--text-muted); margin-bottom:8px; display:block; text-transform:uppercase; letter-spacing:0.5px;">Username</label>
            <div style="position:relative;">
                <span class="material-symbols-outlined" style="position:absolute; left:14px; top:50%; transform:translateY(-50%); color:var(--text-muted); font-size:20px; pointer-events:none;">alternate_email</span>
                <input type="text" id="modern-username-input" placeholder="e.g. ayesha_jahan" 
                       value="${currentUserData.username || ''}" 
                       style="width:100%; padding:14px 14px 14px 44px; border-radius:14px; background:var(--surface-2); border:1px solid var(--border); color:var(--text); font-size:15px; font-family:monospace; outline:none; transition:all 0.3s ease;"
                       onfocus="this.style.borderColor='var(--accent)'; this.style.boxShadow='0 0 0 4px var(--accent-glow)'" 
                       onblur="this.style.borderColor='var(--border)'; this.style.boxShadow='none'">
            </div>
            <div class="username-status-msg" style="font-size:11px; color:var(--text-muted); margin-top:6px; display:flex; align-items:center; gap:4px;">
                <span class="material-symbols-outlined" style="font-size:14px;">info</span> Only letters, numbers & underscores allowed.
            </div>
        `;
        
        //     
        nameInputContainer.insertAdjacentElement('afterend', wrapper);
        
        //      
        checkUsernameCooldownV3();

        // - 
        const inputEl = document.getElementById('modern-username-input');
        inputEl.addEventListener('input', (e) => {
            const val = e.target.value;
            const isValid = /^[a-z0-9_]*$/.test(val);
            
            if(val && !isValid) {
                e.target.style.borderColor = '#ef4444';
                e.target.style.background = 'rgba(239, 68, 68, 0.05)';
            } else {
                e.target.style.borderColor = ''; // Reset to CSS default or focused state
                e.target.style.background = '';
            }
        });
    }
}

// .    ( )
function checkUsernameCooldownV3() {
    const msgContainer = document.querySelector('.username-status-msg');
    if(!msgContainer) return;

    if(currentUserData.lastUsernameChange) {
        const daysPassed = (Date.now() - currentUserData.lastUsernameChange) / (1000 * 60 * 60 * 24);
        
        if(daysPassed < 7) {
            const daysLeft = Math.ceil(7 - daysPassed);
            
            //     
            msgContainer.style.background = 'rgba(239, 68, 68, 0.1)';
            msgContainer.style.color = '#ef4444';
            msgContainer.style.padding = '8px 12px';
            msgContainer.style.borderRadius = '10px';
            msgContainer.style.fontWeight = '600';
            msgContainer.innerHTML = `
                <span class="material-symbols-outlined" style="font-size:16px;">lock_clock</span>
                Change available in ${daysLeft} day${daysLeft > 1 ? 's' : ''}
            `;
            
            //   
            const input = document.getElementById('modern-username-input');
            if(input) {
                input.disabled = true;
                input.style.opacity = '0.6';
                input.style.cursor = 'not-allowed';
            }
        }
    }
}

// . Search Users  Username   
//  existing searchUsers()   users.forEach     
const originalSearchUsers = window.searchUsers;
window.searchUsers = async function() {
    clearTimeout(searchTimeout);
    const q = document.getElementById('search-input').value.trim().toLowerCase();
    const res = document.getElementById('search-results-list');
    
    if(!q) { renderRecentSearches(); return; }
    
    searchTimeout = setTimeout(async () => {
        const users = await fetchAllUsers();
        let html = '';
        
        //       
        users.forEach(u => {
            const uId = u.id;
            const matchesName = (u.name || '').toLowerCase().includes(q);
            const matchesUsername = (u.username || '').toLowerCase().includes(q);
            
            if(matchesName || matchesUsername) {
                // ...  existing user rendering code here ...
                // :
                const safeName = escapeHTML(u.name);
                const avHtml = u.avatar ? `<img src="${u.avatar}">` : avatarInitial(u.name);
                html += `<div class="msg-item" onclick="addToRecentSearches('${uId}'); viewUserProfile('${uId}')">
                    <div class="avatar">${avHtml}</div>
                    <div class="msg-info"><div class="msg-name">${safeName}</div>
                    <div style="font-size:12px; color:var(--text-muted);">@${escapeHTML(u.username||'')}</div></div>
                </div>`;
            }
        });
        
        res.innerHTML = html || '<div class="empty-feed">No users found</div>';
    }, 300);
};

// . Copy Profile Link  Username  
//  existing copyProfileLink()      
window.copyProfileLink = function() {
    const username = currentUserData.username;
    //       ,   UID 
    const profileLink = username 
        ? `https://go-chat-zyp2.vercel.app/?user=${username}` 
        : `https://go-chat-zyp2.vercel.app/?user=${currentUser.uid}`;
        
    navigator.clipboard.writeText(profileLink).then(() => {
        showToast(username ? "Username link copied!" : "Profile link copied!");
    }).catch(err => {
        console.error('Failed to copy: ', err);
        alert("Failed to copy link!");
    });
};
// ==========================================
//  CATEGORY SYSTEM LOGIC (Fast Filtering)
// ==========================================
let currentCategoryTab = 'all';

function openCategoryScreen() {
    closeMainMenu(); //   
    document.getElementById('category-screen').style.display = 'flex';
    switchCategoryTab('all'); //  All   
}

function closeCategoryScreen() {
    document.getElementById('category-screen').style.display = 'none';
}

function switchCategoryTab(tabName) {
    currentCategoryTab = tabName;
    
    //   
    const tabs = document.querySelectorAll('.cat-tab');
    tabs.forEach(t => t.classList.remove('active'));
    
    if(tabs.length >= 3) {
        if(tabName === 'all') tabs[0].classList.add('active');
        if(tabName === 'ridiculous') tabs[1].classList.add('active');
        if(tabName === 'painful') tabs[2].classList.add('active');
    }
    
    loadCategoryPosts(tabName);
}

async function loadCategoryPosts(tabName) {
    const list = document.getElementById('category-posts-list');
    list.innerHTML = '<div class="loading" style="text-align:center; padding:40px; color:var(--text-muted);"><span class="material-symbols-outlined" style="animation: spin 1s linear infinite;">autorenew</span> Loading...</div>';
    
    try {
        //      
        const snap = await db.collection('posts').orderBy('createdAt', 'desc').limit(50).get();
        let posts = [];
        
        //     
        const funnyKeywords = ['', '', '', '', '', 'funny', 'laugh', 'haha', 'crazy', 'ridiculous', 'joy', 'happy', 'lmao', 'lol', 'silly'];
        const sadKeywords = ['', '', '', '', '', 'sad', 'painful', 'broken', 'cry', 'depressed', 'hurt', 'pain', 'sorrow', 'alone'];
        
        snap.forEach(d => {
            const p = { id: d.id, ...d.data() };
            
            //     /    
            const fullText = ((p.title || '') + ' ' + (p.activity ? p.activity.text + ' ' + p.activity.icon : '')).toLowerCase();
            
            let isFunny = funnyKeywords.some(kw => fullText.includes(kw));
            let isSad = sadKeywords.some(kw => fullText.includes(kw));
            
            //  
            if (tabName === 'all') {
                posts.push(p);
            } else if (tabName === 'ridiculous' && isFunny) {
                posts.push(p);
            } else if (tabName === 'painful' && isSad) {
                posts.push(p);
            }
        });
        
        //      
        const mutedList = currentUserData?.mutedFeedUsers || [];
        posts = posts.filter(p => !mutedList.includes(p.uid));
        
        //       
        if (posts.length === 0) {
            list.innerHTML = `<div style="text-align:center; padding: 60px 20px; color: var(--text-muted);">
                <span class="material-symbols-outlined" style="font-size: 60px; margin-bottom:15px; opacity:0.3;">inbox</span>
                <h3 style="color:var(--text); margin-bottom:5px;">No posts found</h3>
                <p style="font-size:14px;">No posts match this category yet.</p>
            </div>`;
            return;
        }
        
        //    
        list.innerHTML = posts.map(p => buildPostCardHTML(p)).join('');
        
    } catch (error) {
        console.error(error);
        list.innerHTML = '<div class="empty-feed">Failed to load posts</div>';
    }
}
// ==========================================
//  NEW: ADVANCED VOICE RECORDING SYSTEM
// ==========================================
let mediaRecorder;
let audioChunks = [];
let recordInterval;
let recordSeconds = 0;

async function startVoiceRecord() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = event => {
            if (event.data.size > 0) audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            //    
            stream.getTracks().forEach(track => track.stop());
            
            //    ,     
            if (audioChunks.length === 0) return;
            
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            await uploadAndSendVoice(audioBlob);
        };

        //   
        mediaRecorder.start();
        
        // UI   (    )
        document.getElementById('chat-input').style.display = 'none';
        document.getElementById('voice-start-btn').style.display = 'none';
        document.getElementById('image-upload-btn').style.display = 'none';
        document.getElementById('text-send-btn').style.display = 'none';
        document.getElementById('recording-ui').style.display = 'flex';
        
        //  
        recordSeconds = 0;
        document.getElementById('record-time').textContent = "00:00";
        recordInterval = setInterval(() => {
            recordSeconds++;
            const mins = String(Math.floor(recordSeconds / 60)).padStart(2, '0');
            const secs = String(recordSeconds % 60).padStart(2, '0');
            document.getElementById('record-time').textContent = `${mins}:${secs}`;
        }, 1000);

    } catch (err) {
        console.error(err);
        showToast("Microphone access denied. Please allow permission.");
    }
}

function cancelVoiceRecord() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        audioChunks = []; //      onstop   
        mediaRecorder.stop();
    }
    resetRecordUI();
    showToast("Voice recording canceled");
}

function sendVoiceRecord() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop(); //  onstop      
    }
    resetRecordUI();
}

function resetRecordUI() {
    clearInterval(recordInterval);
    document.getElementById('recording-ui').style.display = 'none';
    document.getElementById('chat-input').style.display = 'block';
    document.getElementById('voice-start-btn').style.display = 'flex';
    document.getElementById('image-upload-btn').style.display = 'flex';
    document.getElementById('text-send-btn').style.display = 'flex';
}

async function uploadAndSendVoice(audioBlob) {
    if (!currentChatId || !checkRateLimit()) return;
    showToast("Sending voice message...");
    
    // Cloudinary   (Cloudinary   /video/upload   )
    const formData = new FormData();
    formData.append('file', audioBlob, 'voicemsg.webm');
    formData.append('upload_preset', 'gochat'); 
    
    try {
        const res = await fetch('https://api.cloudinary.com/v1_1/dsnqmwyvt/video/upload', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if (!data.secure_url) throw new Error("Upload failed");
        
        const audioUrl = data.secure_url;
        
        //    
        const msgData = {
            uid: currentUser.uid,
            senderName: currentUserData.name || 'User',
            text: '',
            audioUrl: audioUrl, //   
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        //      
        if(currentReplyMsgId && replyToMsgData){
            msgData.replyTo = currentReplyMsgId;
            msgData.replySender = replyToMsgData.senderName || 'User';
            msgData.replyText = replyToMsgData.text || (replyToMsgData.audioUrl ? ' Voice Message' : ' Photo');
            
            currentReplyMsgId = null;
            replyToMsgData = null;
            document.getElementById('reply-preview-container').innerHTML = '';
            document.getElementById('chat-input').placeholder = 'Message...';
        }

        await db.collection('chats').doc(currentChatId).collection('messages').add(msgData);

        let lastText = ' Voice Message';
        if (currentChatOtherUid === 'group') {
            lastText = (currentUserData.name || 'User') + " sent a voice message";
        }

        await db.collection('chats').doc(currentChatId).set({
            lastMsg: lastText,
            lastAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastSender: currentUser.uid,
            isRead: false
        }, { merge: true });

        showToast("Voice sent!");
    } catch (err) {
        console.error(err);
        showToast("Failed to send voice message");
    }
}

// ==========================================
//  SMART BACK BUTTON & HISTORY MANAGER
// ==========================================
let backPressTimer = null;

//        
history.pushState({ page: 'gochat_home' }, "", window.location.href);

window.addEventListener('popstate', function(event) {
    //       ,    
    if (closeTopMostView()) {
        //         
        history.pushState({ page: 'gochat_home' }, "", window.location.href);
    } else {
        //     ,     
        if (backPressTimer) {
            clearTimeout(backPressTimer);
            //       ( popstate     )
        } else {
            showToast("Press back again to exit");
            //         
            history.pushState({ page: 'gochat_home' }, "", window.location.href);
            backPressTimer = setTimeout(() => {
                backPressTimer = null;
            }, 2000);
        }
    }
});

//                 
function closeTopMostView() {
    // . Full Screen Image Zoom
    const imageZoom = document.getElementById('image-zoom-modal');
    if (imageZoom && imageZoom.classList.contains('open')) { closeImageZoom(); return true; }

    // . Story Viewer
    const storyViewer = document.getElementById('story-viewer');
    if (storyViewer && storyViewer.classList.contains('open')) { closeStory(); return true; }

    // . Bottom Sheets / Action Modals
    const deleteSheet = document.getElementById('delete-sheet-modal');
    if (deleteSheet && deleteSheet.classList.contains('open')) { closeDeleteSheet(); return true; }
    
    const qpModal = document.getElementById('quick-profile-modal');
    if (qpModal && qpModal.classList.contains('open')) { closeQuickProfile(); return true; }

    const wpModal = document.getElementById('wallpaper-modal');
    if (wpModal && wpModal.classList.contains('open')) { closeWallpaperPicker(); return true; }
    
    const forwardModal = document.getElementById('forward-modal');
    if (forwardModal && forwardModal.classList.contains('open')) { closeForwardModal(); return true; }

    // . Sub Screens (Chat, Profile, Post etc)
    const commentPanel = document.getElementById('comment-panel');
    if (commentPanel && commentPanel.classList.contains('open')) { closeCommentPanel(); return true; }

    const singlePost = document.getElementById('single-post-screen');
    if (singlePost && singlePost.classList.contains('open')) { closeSinglePost(); return true; }

    const chatScreen = document.getElementById('chat-screen');
    if (chatScreen && chatScreen.classList.contains('open')) { closeChat(); return true; }

    const otherProfile = document.getElementById('page-other-profile');
    if (otherProfile && otherProfile.classList.contains('open')) { closeUserProfile(); return true; }

    const createPost = document.getElementById('create-post-screen');
    if (createPost && createPost.classList.contains('open')) { closeCreatePost(); return true; }

    const groupInfo = document.getElementById('group-info-modal');
    if (groupInfo && groupInfo.style.display === 'flex') { closeGroupInfoModal(); return true; }

    // . Settings & Menus
    const editProfile = document.getElementById('edit-profile-screen');
    if (editProfile && editProfile.style.display === 'flex') { closeProfileEdit(); return true; }

    const galleryScreen = document.getElementById('gallery-screen');
    if (galleryScreen && galleryScreen.style.display === 'flex') { closeGallery(); return true; }

    const catScreen = document.getElementById('category-screen');
    if (catScreen && catScreen.style.display === 'flex') { closeCategoryScreen(); return true; }

    const mainSettings = document.getElementById('main-settings-screen');
    if (mainSettings && mainSettings.style.display === 'flex') { closeMainSettingsScreen(); return true; }

    const mainMenu = document.getElementById('main-menu-screen');
    if (mainMenu && mainMenu.style.display === 'flex') { closeMainMenu(); return true; }

    // . Bottom Navigation Pages (Back to Feed)
    const feedPage = document.getElementById('page-feed');
    if (feedPage && !feedPage.classList.contains('active')) {
        showPage('feed'); return true;
    }

    //     false   (    )
    return false;
}
// ==========================================
//  ACCOUNT BINDING (LINKING) SYSTEM 
// ==========================================

// . UI   
function renderLinkedAccountsUI() {
    const list = document.getElementById('linked-accounts-list');
    if (!list || !currentUser) return;

    //          
    const providers = currentUser.providerData.map(p => p.providerId);
    const isGoogleLinked = providers.includes('google.com');

    // Google Binding Item Design
    list.innerHTML = `
        <div class="linked-account-item">
            <div class="provider-info">
                <div class="provider-icon">
                    <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" style="width:20px;height:20px;">
                </div>
                Google
            </div>
            ${isGoogleLinked 
                ? `<button class="btn-bind unlink" onclick="unlinkAccount('google.com')">Unlink</button>`
                : `<button class="btn-bind bind" onclick="bindGoogleAccount()">Bind</button>`
            }
        </div>
    `;
}

// . Google   (Link)  
async function bindGoogleAccount() {
    if(!checkRateLimit()) return;
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
        showToast("Opening Google login...");
        // -   
        await currentUser.linkWithPopup(provider);
        showToast("Google Account Linked Successfully! ");
        renderLinkedAccountsUI(); // UI 
    } catch (error) {
        console.error(error);
        if (error.code === 'auth/credential-already-in-use') {
            alert("Error: This Google account is already linked to another GoChat profile!");
        } else {
            showToast("Failed to bind: " + error.message);
        }
    }
}

// .   (Unbind)  
async function unlinkAccount(providerId) {
    if(!confirm("Are you sure you want to unlink this account? You won't be able to quick-login with it anymore.")) return;
    try {
        showToast("Unlinking...");
        await currentUser.unlink(providerId);
        showToast("Account unlinked successfully.");
        renderLinkedAccountsUI(); // UI 
    } catch (error) {
        console.error(error);
        //          ,     
        if (error.code === 'auth/no-such-provider') {
             showToast("Provider not found.");
        } else {
             alert("Error: You must set a password or have another login method before unlinking this account.");
        }
    }
}
//  Settings & Privacy Search Function
function filterPrivacySettings(query) {
    const lowerQuery = query.toLowerCase().trim();
    const listContainer = document.getElementById('privacy-settings-list');
    if (!listContainer) return;

    //     
    const items = listContainer.querySelectorAll('.settings-list-item');
    
    items.forEach(item => {
        const text = item.innerText.toLowerCase();
        //        ,  ,  
        if (text.includes(lowerQuery)) {
            item.style.display = 'flex'; //   flex  flex  
        } else {
            item.style.display = 'none';
        }
    });
}
// ==========================================
//  NOTIFICATION BATCH DELETE SYSTEM 
// ==========================================
let isNotifEditMode = false;
let selectedNotifs = [];

function toggleNotifEditMode() {
    isNotifEditMode = !isNotifEditMode;
    const btn = document.getElementById('notif-edit-btn');
    const bar = document.getElementById('notif-selection-bar');
    
    if (isNotifEditMode) {
        btn.textContent = 'Cancel';
        btn.style.color = 'var(--danger)';
        bar.style.display = 'flex';
        // Show checkboxes
        document.querySelectorAll('.notif-checkbox').forEach(cb => cb.style.display = 'block');
    } else {
        btn.textContent = 'Edit';
        btn.style.color = 'var(--text)';
        bar.style.display = 'none';
        // Hide checkboxes and uncheck them
        document.querySelectorAll('.notif-checkbox').forEach(cb => {
            cb.style.display = 'none';
            cb.checked = false;
        });
        selectedNotifs = [];
        updateNotifSelectedCount();
    }
}

function toggleNotifSelection(id) {
    const idx = selectedNotifs.indexOf(id);
    const cb = document.getElementById(`notif-cb-${id}`);
    
    if (idx > -1) {
        selectedNotifs.splice(idx, 1);
        if(cb) cb.checked = false;
    } else {
        selectedNotifs.push(id);
        if(cb) cb.checked = true;
    }
    updateNotifSelectedCount();
}

function updateNotifSelectedCount() {
    const countText = document.getElementById('notif-selected-count');
    if(countText) countText.textContent = `${selectedNotifs.length} Selected`;
}

async function deleteSelectedNotifs() {
    if (selectedNotifs.length === 0) {
        showToast("No notifications selected.");
        return;
    }
    if (!confirm(`Are you sure you want to delete ${selectedNotifs.length} notification(s)?`)) return;
    
    showToast("Deleting...");
    try {
        const batch = db.batch();
        selectedNotifs.forEach(id => {
            const ref = db.collection('notifications').doc(id);
            batch.delete(ref);
        });
        await batch.commit();
        
        showToast("Notifications deleted!");
        toggleNotifEditMode(); // Exit edit mode after deletion
    } catch (e) {
        showToast("Failed to delete notifications.");
        console.error(e);
    }
}
// ==========================================
//  CATEGORY SYSTEM (REAL-TIME FIX) 
// ==========================================
let categoryUnsub = null;

function openCategoryScreen() {
    closeMainMenu();
    document.getElementById('category-screen').style.display = 'flex';
    //  'All'   
    switchCategoryTab('all', document.querySelector('.cat-tab'));
}

function closeCategoryScreen() {
    document.getElementById('category-screen').style.display = 'none';
    if(categoryUnsub) { 
        categoryUnsub(); 
        categoryUnsub = null; 
    }
}

function switchCategoryTab(catName, tabElement) {
    //   (Active Color)  
    if(tabElement) {
        document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
        tabElement.classList.add('active');
    }

    const list = document.getElementById('category-posts-list');
    list.innerHTML = '<div class="loading" style="padding:40px 20px; text-align:center;"><span class="material-symbols-outlined" style="font-size:32px; animation:spin 1s linear infinite;">autorenew</span><br><br>Loading Posts...</div>';

    //        (    )
    if (categoryUnsub) categoryUnsub();

    //  -   (/    )
    categoryUnsub = db.collection('posts').orderBy('createdAt', 'desc').onSnapshot(snap => {
        let posts = [];
        
        snap.forEach(d => {
            let p = { id: d.id, ...d.data() };
            
            //    
            if (catName === 'all') {
                posts.push(p);
            } else {
                //   activity       
                if (p.activity && p.activity.text && p.activity.text.toLowerCase() === catName.toLowerCase()) {
                    posts.push(p);
                }
            }
        });

        //       ()
        const mutedList = currentUserData?.mutedFeedUsers || [];
        posts = posts.filter(p => !mutedList.includes(p.uid));

        if (posts.length === 0) {
            list.innerHTML = `<div class="empty-feed" style="margin-top:40px;"><span class="material-symbols-outlined" style="font-size:48px; opacity:0.3;">inbox</span><br>No posts found in '${catName}' category</div>`;
            return;
        }

        //         
        list.innerHTML = posts.map(p => buildPostCardHTML(p)).join('');
    });
}
//  Main Menu Search Function (Fixed)
function filterMenuSettings(query) {
    const lowerQuery = query.toLowerCase().trim();
    
    //       
    const menuScreen = document.getElementById('main-menu-screen');
    if (!menuScreen) return;

    //       ( .mi-done  )   
    const items = menuScreen.querySelectorAll('.settings-list-item.mi-done');
    
    items.forEach(item => {
        //    (: Elite GoChat, Category, Saved )  
        const text = item.innerText.toLowerCase();
        
        if (text.includes(lowerQuery)) {
            //   
            item.style.setProperty('display', 'flex', 'important');
        } else {
            //     
            item.style.setProperty('display', 'none', 'important');
        }
    });
}
// ==========================================
//  PUSH NOTIFICATION (FCM) SETUP 
// ==========================================
let messaging = null;

try {
    if (firebase.messaging.isSupported()) {
        messaging = firebase.messaging();
    }
} catch (e) {
    console.log("Firebase Messaging not supported in this environment:", e);
}

//       
async function requestPushNotificationPermission() {
    if (!messaging || !currentUser) return;
    
    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            console.log('Notification permission granted.');
            
            //      
            // (:     Web Push Certificates (VAPID key)    )
            const token = await messaging.getToken({
                vapidKey: 'YOUR_WEB_PUSH_VAPID_KEY_HERE' //       
            });
            
            if (token) {
                //      ,      
                await db.collection('users').doc(currentUser.uid).set({
                    fcmToken: token
                }, { merge: true });
                console.log('FCM Token saved:', token);
            }
        } else {
            console.log('Unable to get permission to notify.');
        }
    } catch (error) {
        console.error('An error occurred while retrieving token. ', error);
    }
}
// ==========================================
//  POST INSIGHTS SYSTEM
// ==========================================

// . Insights   (    )
async function openPostInsights(pid){
  closeAllDropdowns();
  const modal = document.getElementById('post-insights-modal');
  //  
  document.getElementById('pi-metrics').innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--text-muted);">Loading insights...</div>';
  document.getElementById('pi-chart').innerHTML = '';
  document.getElementById('pi-engagement').innerHTML = '';
  document.getElementById('pi-elite-section').innerHTML = '';
  document.getElementById('pi-post-title').textContent = '';
  modal.classList.add('open');
  modal.style.display = 'flex';

  try{
    const doc = await db.collection('posts').doc(pid).get();
    if(!doc.exists){ showToast("Post not found"); closePostInsights(); return; }
    const p = doc.data();

    // :     
    if(p.uid !== currentUser.uid){ showToast("You can only view your own insights"); closePostInsights(); return; }

    renderPostInsights(p);
  }catch(e){
    console.error(e);
    showToast("Failed to load insights");
    closePostInsights();
  }
}

function closePostInsights(){
  const modal = document.getElementById('post-insights-modal');
  modal.classList.remove('open');
  modal.style.display = 'none';
}

// .  
function renderPostInsights(p){
  const views    = p.views || 0;
  const likes    = (p.likedBy && p.likedBy.length) || 0;
  const comments = (p.comments && p.comments.length) || 0;
  const shares   = p.shareCount || 0;
  const total    = likes + comments + shares;
  const engRate  = views > 0 ? ((total / views) * 100) : 0;

  //  
  document.getElementById('pi-post-title').textContent = p.title ? ('' + p.title + '') : '(Photo post)';
  document.getElementById('pi-subtitle').textContent = 'Live performance  updated now';

  //  
  const cards = [
    {ico:'visibility',  val:views,    lbl:'Views',    grad:'linear-gradient(135deg,#60a5fa,#2563eb)'},
    {ico:'favorite',    val:likes,    lbl:'Likes',    grad:'linear-gradient(135deg,#fb7185,#e11d48)'},
    {ico:'chat_bubble', val:comments, lbl:'Comments', grad:'linear-gradient(135deg,#34d399,#059669)'},
    {ico:'share',       val:shares,   lbl:'Shares',   grad:'linear-gradient(135deg,#fbbf24,#d97706)'}
  ];
  document.getElementById('pi-metrics').innerHTML = cards.map(c => `
    <div class="pi-card">
      <div class="pi-ico" style="background:${c.grad};"><span class="material-symbols-outlined" style="font-size:20px;">${c.ico}</span></div>
      <div class="pi-val">${formatInsightNum(c.val)}</div>
      <div class="pi-lbl">${c.lbl}</div>
    </div>`).join('');

  //  
  const engColor = engRate >= 8 ? '#22c55e' : (engRate >= 3 ? '#f59e0b' : '#94a3b8');
  const engMsg = engRate >= 8 ? ' Outstanding reach!' : (engRate >= 3 ? ' Performing well' : ' Try posting at peak hours');
  document.getElementById('pi-engagement').innerHTML = `
    <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;">Engagement Rate</div>
    <div style="font-size:34px;font-weight:900;color:${engColor};margin:4px 0;">${engRate.toFixed(1)}%</div>
    <div style="font-size:12px;color:var(--text-secondary);">${engMsg}</div>`;

  //  
  const max = Math.max(views, likes, comments, shares, 1);
  const rows = [
    {lbl:'Views',    val:views,    col:'#3b82f6'},
    {lbl:'Likes',    val:likes,    col:'#e11d48'},
    {lbl:'Comments', val:comments, col:'#059669'},
    {lbl:'Shares',   val:shares,   col:'#d97706'}
  ];
  document.getElementById('pi-chart').innerHTML = rows.map(r => `
    <div class="pi-bar-row">
      <div class="pi-bar-lbl">${r.lbl}</div>
      <div class="pi-bar-track"><div class="pi-bar-fill" data-w="${(r.val/max*100).toFixed(1)}" style="background:${r.col};"></div></div>
      <div class="pi-bar-num">${formatInsightNum(r.val)}</div>
    </div>`).join('');
  //  
  setTimeout(()=>{ document.querySelectorAll('#pi-chart .pi-bar-fill').forEach(b=> b.style.width = (b.dataset.w || 0) + '%'); }, 80);

  //  
  renderInsightsElitePanel(p, {views, likes, comments, shares, engRate});
}

// .   ( / )
function renderInsightsElitePanel(p, m){
  const isElite = (currentUserData.isVerified === true) || (currentUserData.isElite === true);
  const box = document.getElementById('pi-elite-section');

  //    computed  (fake )
  const likeRate    = m.views ? (m.likes / m.views * 100) : 0;
  const commentRate = m.views ? (m.comments / m.views * 100) : 0;
  const shareRate   = m.views ? (m.shares / m.views * 100) : 0;
  const ageDays     = p.createdAt ? Math.max(1, Math.floor((Date.now() - (p.createdAt.toMillis ? p.createdAt.toMillis() : p.createdAt)) / 86400000)) : 1;
  const avgDailyView= Math.round(m.views / ageDays);

  const detailHTML = `
    <div style="padding:16px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
        <span class="material-symbols-outlined" style="color:#d97706;">workspace_premium</span>
        <span style="font-weight:800;font-size:14px;color:var(--text);">Audience Quality</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;">
        ${eliteMeter('Like rate', likeRate, '#e11d48')}
        ${eliteMeter('Comment rate', commentRate, '#059669')}
        ${eliteMeter('Share rate', shareRate, '#d97706')}
      </div>
      <div style="display:flex;gap:12px;margin-top:16px;">
        <div style="flex:1;background:var(--surface-2);border:1px solid var(--border);border-radius:12px;padding:12px;text-align:center;">
          <div style="font-size:20px;font-weight:900;color:var(--text);">${formatInsightNum(avgDailyView)}</div>
          <div style="font-size:10px;color:var(--text-muted);font-weight:700;">AVG VIEWS / DAY</div>
        </div>
        <div style="flex:1;background:var(--surface-2);border:1px solid var(--border);border-radius:12px;padding:12px;text-align:center;">
          <div style="font-size:20px;font-weight:900;color:var(--text);">${ageDays}d</div>
          <div style="font-size:10px;color:var(--text-muted);font-weight:700;">POST AGE</div>
        </div>
      </div>
      <div style="margin-top:14px;font-size:12px;color:var(--text-secondary);line-height:1.5;background:var(--accent-glow);padding:10px 12px;border-radius:12px;">
         ${likeRate > commentRate ? 'Your audience loves reacting  post more visual content!' : 'Strong conversations  ask questions to boost comments further.'}
      </div>
    </div>`;

  if(isElite){
    box.innerHTML = `<div class="pi-locked" style="border-color:rgba(212,175,55,.5);">${detailHTML}</div>`;
  } else {
    box.innerHTML = `
      <div class="pi-locked">
        <div class="pi-locked-blur">${detailHTML}</div>
        <div class="pi-locked-overlay">
          <span class="material-symbols-outlined" style="font-size:34px;color:#fbbf24;">lock</span>
          <div style="font-weight:800;font-size:15px;color:#fff;">Detailed Analytics</div>
          <div style="font-size:12px;color:rgba(255,255,255,.85);max-width:240px;">Unlock audience quality, daily reach & smart tips with Elite GoChat.</div>
          <button onclick="closePostInsights(); openEliteGoChat();"><span class="material-symbols-outlined" style="font-size:16px;">workspace_premium</span> Unlock Elite</button>
        </div>
      </div>`;
  }
}

function eliteMeter(label, pct, col){
  const v = Math.min(pct, 100);
  return `
    <div>
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px;">
        <span style="color:var(--text-secondary);font-weight:600;">${label}</span>
        <span style="color:var(--text);font-weight:800;">${pct.toFixed(1)}%</span>
      </div>
      <div class="pi-bar-track"><div class="pi-bar-fill" data-w="${v.toFixed(1)}" style="background:${col};"></div></div>
    </div>`;
}

function formatInsightNum(n){
  n = n || 0;
  if(n >= 1000000) return (n/1000000).toFixed(1).replace(/\.0$/,'') + 'M';
  if(n >= 1000)    return (n/1000).toFixed(1).replace(/\.0$/,'') + 'K';
  return String(n);
}

// . View Tracking  openSinglePostView  wrap  (owner )  
(function patchViewTracking(){
  const _orig = window.openSinglePostView;
  if(typeof _orig !== 'function') return;
  window.openSinglePostView = function(pid, ...rest){
    const ret = _orig.apply(this, [pid, ...rest]);
    //  session-     (honest unique-ish view)
    try{
      const flag = 'pi_viewed_' + pid;
      if(!sessionStorage.getItem(flag)){
        db.collection('posts').doc(pid).get().then(d=>{
          if(d.exists && d.data().uid !== currentUser.uid){
            db.collection('posts').doc(pid).update({ views: firebase.firestore.FieldValue.increment(1) }).catch(()=>{});
            sessionStorage.setItem(flag, '1');
          }
        }).catch(()=>{});
      }
    }catch(e){}
    return ret;
  };
})();
// ==========================================
//  SHARE POST TO CHAT LOGIC (COMPLETE & FIXED)
// ==========================================
let currentSharePostData = null;
let allShareChats = []; 

function openShareModal(postId, postTitle, postImg) {
    currentSharePostData = { id: postId, title: postTitle, img: postImg };
    document.getElementById('share-post-modal').classList.add('open');
    document.getElementById('share-chat-list').innerHTML = '<div class="loading" style="text-align:center; padding:20px; color:var(--text-muted);"><span class="material-symbols-outlined" style="animation: spin 1s linear infinite;">autorenew</span> Loading chats...</div>';
    
    //       
    loadShareChatList();
}

function closeShareModal() {
    document.getElementById('share-post-modal').classList.remove('open');
    document.getElementById('share-search-input').value = '';
    currentSharePostData = null;
}

//        (  )
async function loadShareChatList() {
    const list = document.getElementById('share-chat-list');
    if (!allUsersCache) await fetchAllUsers(); //       
    
    try {
        const snap = await db.collection('chats').get();
        let chats = [];
        
        snap.forEach(d => {
            const data = d.data();
            const chatId = d.id;
            
            let isMyChat = false;
            if (data.isGroup && data.members && data.members.includes(currentUser.uid)) {
                isMyChat = true;
            } else if (!data.isGroup && chatId.includes(currentUser.uid)) {
                isMyChat = true;
            }

            if (!isMyChat) return;

            if (data.isGroup) {
                chats.push({
                    id: chatId, uid: 'group', name: data.groupName || 'Group', avatar: data.groupAvatar || '', isGroup: true
                });
            } else {
                const parts = chatId.split('_');
                if (parts.length === 2) {
                    const otherUid = parts[0] === currentUser.uid ? parts[1] : parts[0];
                    const blockedUsers = currentUserData?.blockedUsers || [];
                    if (!blockedUsers.includes(otherUid)) {
                        //       
                        const liveUser = allUsersCache ? allUsersCache.find(u => u.id === otherUid) : null;
                        const finalAv = liveUser ? liveUser.avatar : (data.avatars?.[otherUid] || '');
                        const finalName = liveUser ? liveUser.name : (data.names?.[otherUid] || 'User');
                        
                        chats.push({
                            id: chatId, uid: otherUid, name: finalName, avatar: finalAv, isGroup: false
                        });
                    }
                }
            }
        });

        allShareChats = chats; 
        renderShareChatList(chats);
        
    } catch(e) {
        list.innerHTML = '<div style="text-align:center; padding:20px; color:var(--danger);">Failed to load chats.</div>';
    }
}

function renderShareChatList(chats) {
    const list = document.getElementById('share-chat-list');
    if (chats.length === 0) {
        list.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">No matching chats found.</div>';
        return;
    }

    let html = '';
    chats.forEach(chat => {
        let avHtml = '';
        if (chat.avatar) {
            avHtml = `<img src="${escapeHTML(chat.avatar)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
        } else if (chat.isGroup) {
            avHtml = `<div style="width:100%;height:100%;background:var(--gradient-orange);color:white;display:flex;align-items:center;justify-content:center;border-radius:50%;"><span class="material-symbols-outlined">groups</span></div>`;
        } else {
            avHtml = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:var(--gradient);color:#fff;font-weight:bold;font-size:16px;border-radius:50%;">${avatarInitial(chat.name)}</div>`;
        }

        html += `
        <div class="msg-item" style="padding:10px 14px; margin:0; box-shadow:none;">
            <div class="avatar sm" style="width:40px; height:40px;">${avHtml}</div>
            <div class="msg-info" style="margin-left:10px;">
                <div class="msg-name">${escapeHTML(chat.name)}</div>
            </div>
            <button class="btn-primary" style="margin:0; width:auto; padding:6px 16px; font-size:12px; border-radius:20px;" onclick="sendSharedPost('${chat.id}', '${chat.uid}', this)">Send</button>
        </div>`;
    });
    list.innerHTML = html;
}

function filterShareList(query) {
    const q = query.toLowerCase().trim();
    if (!q) { renderShareChatList(allShareChats); return; }
    const filtered = allShareChats.filter(c => c.name.toLowerCase().includes(q));
    renderShareChatList(filtered);
}

//       (   )
async function sendSharedPost(chatId, otherUid, btn) {
    if (!currentSharePostData || !checkRateLimit()) return;
    
    //   
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px; animation:spin 1s linear infinite;">autorenew</span>';

    const msgData = {
        uid: currentUser.uid,
        senderName: currentUserData.name || 'User',
        text: "Shared a post",
        sharedPostId: currentSharePostData.id,
        sharedPostTitle: currentSharePostData.title,
        sharedPostImg: currentSharePostData.img,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    try {
        await db.collection('chats').doc(chatId).collection('messages').add(msgData);
        
        let lastText = " Shared a post";
        if (otherUid === 'group') {
            lastText = (currentUserData.name || 'User') + ":  Shared a post";
        }

        await db.collection('chats').doc(chatId).set({
            lastMsg: lastText,
            lastAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastSender: currentUser.uid,
            isRead: false
        }, { merge: true });

        //   :     +1  
        try {
            await db.collection('posts').doc(currentSharePostData.id).update({
                shares: firebase.firestore.FieldValue.increment(1)
            });
        } catch(err) {
            console.log("Failed to update share count");
        }

        //      Sent  
        btn.innerHTML = 'Sent <i class="ph-bold ph-check"></i>';
        btn.style.background = 'var(--success)';
        btn.style.color = '#fff';
        showToast("Post shared successfully!");
        
    } catch(e) {
        btn.disabled = false;
        btn.innerHTML = 'Send';
        showToast("Failed to share post");
    }
}
// ==========================================
//  MENU SEARCH BAR LOGIC
// ==========================================

// . Main Menu-     
function filterMenuSettings(query) {
    const q = query.toLowerCase();
    
    //         
    const mainMenuContainer = document.getElementById('main-menu-screen').children[1];
    
    //       
    Array.from(mainMenuContainer.children).forEach(child => {
        //       (   )
        if (child.classList.contains('settings-list-item')) {
            const text = child.textContent.toLowerCase();
            if (text.includes(q)) {
                //    
                child.style.setProperty('display', 'flex', 'important');
            } else {
                //      
                child.style.setProperty('display', 'none', 'important');
            }
        }
    });
}

// . Settings & Privacy-      ()
function filterPrivacySettings(query) {
    const q = query.toLowerCase();
    const list = document.getElementById('privacy-settings-list');
    if(!list) return;
    
    const items = list.querySelectorAll('.settings-list-item');
    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        if(text.includes(q)) {
            item.style.setProperty('display', 'flex', 'important');
        } else {
            item.style.setProperty('display', 'none', 'important');
        }
    });
}
//  .      
function openStoryCreatorModal() {
    let modal = document.getElementById('story-creator-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'story-creator-modal';
        modal.className = 'modal-overlay';
        modal.style.zIndex = '10005';
        modal.innerHTML = `
            <div class="modal-box" style="max-width: 400px; text-align: center;">
                <button class="modal-close" onclick="closeStoryCreatorModal()"><span class="material-symbols-outlined">close</span></button>
                <div class="modal-title" style="margin-bottom: 24px;">Create Story</div>
                
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <!--      -->
                    <label class="story-type-card">
                        <div style="width: 44px; height: 44px; border-radius: 50%; background: rgba(255,77,106,0.1); color: var(--danger); display: flex; align-items: center; justify-content: center;">
                            <span class="material-symbols-outlined" style="font-size: 24px;">photo_library</span>
                        </div>
                        <div style="text-align: left; flex: 1;">
                            <div>Photo/Video Story</div>
                            <div style="font-size: 12px; color: var(--text-muted); font-weight: 500;">Upload from your gallery</div>
                        </div>
                        <input type="file" accept="image/*,video/*" style="display:none;" onchange="closeStoryCreatorModal(); uploadStory(this);">
                    </label>

                    <!--    -->
                    <div class="story-type-card" onclick="closeStoryCreatorModal(); openTextStoryModal();">
                        <div style="width: 44px; height: 44px; border-radius: 50%; background: rgba(245,158,11,0.1); color: var(--warning); display: flex; align-items: center; justify-content: center;">
                            <span class="material-symbols-outlined" style="font-size: 24px;">text_fields</span>
                        </div>
                        <div style="text-align: left; flex: 1;">
                            <div>Text Story</div>
                            <div style="font-size: 12px; color: var(--text-muted); font-weight: 500;">Write with a colored background</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    modal.classList.add('open');
}

function closeStoryCreatorModal() {
    const modal = document.getElementById('story-creator-modal');
    if (modal) modal.classList.remove('open');
}
//  Grid View  
async function toggleFeedViewMode() {
    if (!currentUser) return;
    const currentMode = currentUserData.feedViewMode || 'list';
    const newMode = currentMode === 'list' ? 'grid' : 'list';
    
    currentUserData.feedViewMode = newMode;
    await db.collection('users').doc(currentUser.uid).update({ feedViewMode: newMode });
    
    updateGridToggleUI();
    
    //       
    if (document.getElementById('page-feed').classList.contains('active')) {
        loadFeed(); 
    }
    showToast(newMode === 'grid' ? 'Grid View Enabled' : 'List View Enabled');
}

function updateGridToggleUI() {
    const toggleEl = document.getElementById('grid-view-toggle');
    if (toggleEl) {
        if (currentUserData && currentUserData.feedViewMode === 'grid') {
            toggleEl.classList.add('active');
        } else {
            toggleEl.classList.remove('active');
        }
    }
}

//  Grid Post Card 
function buildGridPostCardHTML(p) {
    const pid = p.id;
    const imgUrls = p.imgUrls && p.imgUrls.length > 0 ? p.imgUrls : (p.imgUrl ? [p.imgUrl] : []);
    let mediaHtml = '';
    const safeTitle = escapeHTML(p.title || '');
    
    if (imgUrls.length > 0) {
        mediaHtml = `<img src="${escapeHTML(imgUrls[0])}">`;
    } else {
        mediaHtml = `<div class="grid-text-post" style="background: ${escapeHTML(p.bgColor || 'var(--surface-2)')};">${safeTitle}</div>`;
    }
    
    let multiIcon = imgUrls.length > 1 ? `<span class="material-symbols-outlined" style="position:absolute; top:8px; right:8px; color:#fff; font-size:18px; filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));">content_copy</span>` : '';
    const safeName = escapeHTML(p.name || 'User');
    const av = p.avatar ? `<img src="${p.avatar}" style="width:20px;height:20px;border-radius:50%;object-fit:cover;border:1px solid #fff;">` : `<div style="width:20px;height:20px;border-radius:50%;background:var(--gradient);color:#fff;font-size:10px;display:flex;align-items:center;justify-content:center;border:1px solid #fff;">${avatarInitial(safeName)}</div>`;
    
    return `
    <div class="grid-post-card" onclick="openSinglePostView('${pid}')">
        ${mediaHtml}
        ${multiIcon}
        <div class="grid-post-overlay">
            <div style="flex:1; min-width:0; margin-right:8px;">
                <div class="grid-post-title">${safeTitle || 'View Post'}</div>
                <div style="display:flex; align-items:center; gap:6px;">
                    ${av}
                    <span style="font-size:11px; opacity:0.9; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${safeName}</span>
                </div>
            </div>
            <div style="display:flex; align-items:center; gap:3px; font-size:12px; font-weight:700;">
                <i class="${p.likedBy && p.likedBy.includes(currentUser?.uid) ? 'ph-fill' : 'ph-bold'} ph-heart" style="font-size:15px; ${p.likedBy && p.likedBy.includes(currentUser?.uid) ? 'color:var(--danger);' : ''}"></i>
                ${p.likes || 0}
            </div>
        </div>
    </div>`;
}
// �������������������������������������������������������
//  NEW DESIGN  �  login-redesign  �  2026-07-30
// font load + living orbs + particles + icons + divider
// loginWithEmail / togglePassword / showRegister / Google 
// :  Ctrl+F  "login-redesign"
// �������������������������������������������������������
(function lxLoginRedesign(){

  // .   (distinctive display + readable body)
  if(!document.getElementById('lx-fonts')){
    const l = document.createElement('link');
    l.id = 'lx-fonts'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap';
    document.head.appendChild(l);
  }

  const run = () => {
    const screen = document.getElementById('auth-screen');
    if(!screen || screen.dataset.lxDone) return;
    screen.dataset.lxDone = '1';

    // .    living orb  (heuristic, layout  )
    [...screen.children].forEach(el => {
      if(el.tagName !== 'DIV') return;
      const cs = getComputedStyle(el);
      const txt = (el.textContent || '').trim();
      const w = el.offsetWidth, h = el.offsetHeight;
      const pos = cs.position;
      const bg = (cs.backgroundImage + cs.backgroundColor).toLowerCase();
      const looksLikeOrb = txt === '' && (pos === 'absolute' || pos === 'fixed') &&
        Math.abs(w - h) < 60 && w > 80 &&
        /(rgb\(2[0-5]\d,\s*1[0-5]\d|rgb\(25[0-5],\s*1[0-9]\d|coral|salmon|orange|255,\s*1[0-9]\d|253,\s*18|255,\s*122)/.test(bg + cs.background);
      // fallback: empty positioned square-ish div with warm bg
      const warm = /255,\s*(1[0-9]\d|2[0-4]\d)|253,\s*1[0-9]\d|252,\s*1[0-6]\d/.test(cs.backgroundColor);
      if(looksLikeOrb || (txt === '' && (pos==='absolute'||pos==='fixed') && w>120 && warm)){
        el.classList.add('lx-orb');
      }
    });

    // .  
    if(!screen.querySelector('.lx-particles')){
      const p = document.createElement('div'); p.className = 'lx-particles';
      let h = '';
      for(let i=0;i<16;i++){
        const s = 3 + Math.random()*8;
        h += `<i style="width:${s}px;height:${s}px;left:${Math.random()*100}%;animation-duration:${9+Math.random()*11}s;animation-delay:${Math.random()*9}s;"></i>`;
      }
      p.innerHTML = h; screen.insertBefore(p, screen.firstChild);
    }

    // .  /sparkle   
    document.querySelectorAll('.auth-logo').forEach(logo => {
      if(logo.dataset.lxSpark) return; logo.dataset.lxSpark = '1';
      logo.innerHTML = logo.innerHTML.replace(/(|||sparkle)/i, '<span class="lx-spark">$1</span>');
    });

    // .   (label )
    document.querySelectorAll('#login-form .auth-input-group, #registration-steps .auth-input-group').forEach(grp => {
      if(grp.querySelector('.lx-field-ico')) return;
      const lbl = (grp.querySelector('label')?.textContent || '').toLowerCase();
      const inp = grp.querySelector('input'); if(!inp) return;
      grp.style.position = 'relative';
      const ico = document.createElement('span');
      ico.className = 'material-symbols-outlined lx-field-ico';
      ico.textContent = /pass/.test(lbl) ? 'lock' : (/email|mail/.test(lbl) ? 'mail' : 'person');
      grp.insertBefore(ico, inp);
    });

    // . Google   + divider + trust line
    const forms = [document.getElementById('login-form'), document.getElementById('registration-steps')].filter(Boolean);
    forms.forEach(form => {
      // google button
      const gBtn = [...form.querySelectorAll('button,div,a')].find(b => /google/i.test(b.textContent||'') && !b.classList.contains('lx-google') && !b.classList.contains('btn-auth-primary'));
      if(gBtn && !gBtn.classList.contains('lx-google')) gBtn.classList.add('lx-google');

      // divider before google ()
      if(gBtn && !form.querySelector('.lx-divider')){
        const d = document.createElement('div'); d.className = 'lx-divider'; d.textContent = 'or continue with';
        gBtn.parentNode.insertBefore(d, gBtn);
      }
      // register link
      const reg = [...form.querySelectorAll('a,span,button,div')].find(e => e.children.length===0 && /^\s*Register\s*$/i.test(e.textContent||''));
      if(reg) reg.classList.add('lx-register');
      const foot = reg ? reg.parentElement : null;
      if(foot && !foot.classList.contains('lx-foot')) foot.classList.add('lx-foot');

      // trust line (, google- )
      if(gBtn && !form.querySelector('.lx-trust')){
        const t = document.createElement('div'); t.className = 'lx-trust';
        t.innerHTML = '<span class="material-symbols-outlined">verified_user</span> Secured with encrypted sign-in';
        gBtn.insertAdjacentElement('afterend', t);
      }
    });
  };

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
  setTimeout(run, 400); setTimeout(run, 1200);

  // welcome  login    (font/icon  )
  const reRun = () => { delete (document.getElementById('auth-screen')||{}).dataset?.lxDone; run(); };
  ['goToLogin','showRegister','backToLogin'].forEach(fn => {
    const o = window[fn];
    if(typeof o === 'function' && !o.__lxWrapped){
      window[fn] = function(...a){ const r = o.apply(this,a); setTimeout(run, 60); return r; };
      window[fn].__lxWrapped = true;
    }
  });
})();
// �������������������������������������������������������
//  FIX  �  elite-obsidian-gold-native  �  2026-08-02
// inner white-box reset (structure-proof, inline !important)
// CSS-selector mismatch-    wrapper depth    
// :  Ctrl+F  "elite-shell-fix"
// �������������������������������������������������������
(function eliteShellFix(){
  const SEL = '#elite-app-modal';
  const imp = (el, props) => { for(const k in props) el.style.setProperty(k, props[k], 'important'); };

  function fix(){
    const modal = document.querySelector(SEL);
    if(!modal || getComputedStyle(modal).display === 'none') return;
    const step = modal.querySelector('.eg-step, [id^="app-step"]');
    if(!step) return;

    // . modal overlay  obsidian + stretch (backstop)
    imp(modal, {
      background:'radial-gradient(120% 90% at 50% -10%, #1a150c 0%, #0b0a07 55%, #060503 100%)',
      alignItems:'stretch', justifyContent:'stretch', padding:'0', overflow:'hidden'
    });

    // . step  modal    wrapper neutralize (  )
    let el = step.parentElement;
    while(el && el !== modal){
      imp(el, {
        width:'100%', maxWidth:'100%', margin:'0', background:'transparent',
        border:'none', borderRadius:'0', boxShadow:'none', padding:'0',
        height:'auto', maxHeight:'none', overflow:'visible'
      });
      el = el.parentElement;
    }

    // . modal- direct child = scroll shell (align stretch   full-width )
    const shell = modal.firstElementChild;
    if(shell){
      imp(shell, {
        width:'100%', maxWidth:'100%', margin:'0', height:'100%', maxHeight:'100%',
        overflowY:'auto', overflowX:'hidden', background:'transparent', borderRadius:'0',
        display:'flex', flexDirection:'column', alignItems:'stretch', boxSizing:'border-box'
      });
    }

    // .  step  centered max-width column (content   )
    modal.querySelectorAll('.eg-step, [id^="app-step"]').forEach(st => {
      imp(st, {
        width:'100%', maxWidth:'640px', margin:'0 auto',
        boxSizing:'border-box', overflowX:'hidden'
      });
    });

    // .    horizontal  (  )
    const rail = modal.querySelector('.eg-rail');
    if(rail) imp(rail, { width:'100%', alignSelf:'stretch', flexShrink:'0' });
  }

  const loop = () => fix();
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loop); else loop();
  setInterval(loop, 300);   // modal re-render / open     
})();
// �������������������������������������������������������
//  UPDATED FEATURE  �  profile-qr-namecard (Fixed for Settings)
// �������������������������������������������������������
const QRNC_LIB_QR  = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
const QRNC_LIB_SCAN= 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
const QRNC_LOGO    = '';                 
let qrncCurrentUid = null, qrncCurrentData = null, qrncScanStream = null, qrncScanRAF = null;
const qrncScriptCache = {};

/* ---------- dynamic script loader ---------- */
function qrncLoadScript(url){
  if(qrncScriptCache[url]) return qrncScriptCache[url];
  qrncScriptCache[url] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url; s.async = true;
    const t = setTimeout(() => reject(new Error('timeout')), 9000);
    s.onload  = () => { clearTimeout(t); resolve(true); };
    s.onerror = () => { clearTimeout(t); delete qrncScriptCache[url]; reject(new Error('load-failed')); };
    document.head.appendChild(s);
  });
  return qrncScriptCache[url];
}

function qrncBase(){ return location.origin + location.pathname.replace(/\/+$/,''); }
function qrncProfileLink(u){
  if(!u) return qrncBase();
  const id = u.username || u.id;            
  return qrncBase() + '/?user=' + encodeURIComponent(id);
}

async function qrncLoadUser(uid){
  if(currentUser && uid === currentUser.uid && typeof currentUserData !== 'undefined' && currentUserData){
    return Object.assign({ id: currentUser.uid }, currentUserData);
  }
  if(typeof allUsersCache !== 'undefined' && allUsersCache){
    const c = allUsersCache.find(x => x.id === uid);
    if(c) return Object.assign({ id: uid }, c);
  }
  try{ const d = await db.collection('users').doc(uid).get(); if(d.exists) return Object.assign({ id: uid }, d.data()); }catch(e){}
  return { id: uid, name: 'User' };
}

function qrncMakeMatrix(text){
  const qr = qrcode(0, 'H');                
  qr.addData(text); qr.make();
  const n = qr.getModuleCount();
  const m = [];
  for(let r=0;r<n;r++){ m[r]=[]; for(let c=0;c<n;c++) m[r][c] = qr.isDark(r,c); }
  return { m, n };
}

function qrncDrawQR(canvas, matrix, size, darkColor, logoImg){
  const { m, n } = matrix;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = size * dpr; canvas.height = size * dpr;
  canvas.style.width = size + 'px'; canvas.style.height = size + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,size,size);
  const cell = size / n;
  const gapR = logoImg ? Math.floor(n * 0.135) : 0;
  const mid = (n - 1) / 2;
  ctx.fillStyle = darkColor || '#1c1a2e';
  for(let r=0;r<n;r++){
    for(let c=0;c<n;c++){
      if(!m[r][c]) continue;
      if(gapR && Math.abs(r-mid) <= gapR && Math.abs(c-mid) <= gapR) continue;
      const x = c*cell, y = r*cell;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x+cell*0.08, y+cell*0.08, cell*0.84, cell*0.84, cell*0.22)
                    : ctx.rect(x+cell*0.08, y+cell*0.08, cell*0.84, cell*0.84);
      ctx.fill();
    }
  }
  if(logoImg){
    const ls = cell * gapR * 1.7;
    const lx = (size - ls)/2, ly = (size - ls)/2;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(lx-4, ly-4, ls+8, ls+8, 12) : ctx.rect(lx-4, ly-4, ls+8, ls+8); ctx.fill();
    try{ ctx.drawImage(logoImg, lx, ly, ls, ls); }catch(e){}
  }
}

function qrncLoadImg(url){
  return new Promise(res => {
    if(!url){ res(null); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => res(img);
    img.onerror = () => res(null);
    img.src = url;
  });
}

/* ---------- OPEN CARD ---------- */
async function qrncOpenCard(uid){
  if(!uid) return;
  qrncCurrentUid = uid;
  const modal = document.getElementById('qrnc-modal');
  modal.style.display = 'flex';

  const frame = document.getElementById('qrnc-qr-frame');
  const oldC = frame.querySelector('canvas'); if(oldC) oldC.remove();
  const oldL = frame.querySelector('.qrnc-qr-logo'); if(oldL) oldL.remove();
  document.getElementById('qrnc-qr-loading').style.display = 'flex';

  const u = await qrncLoadUser(uid);
  qrncCurrentData = u;
  const safeName = escapeHTML(u.name || 'User');
  const vBadge = (typeof getVerifiedBadge === 'function') ? getVerifiedBadge(u.email, u.isVerified) : '';
  document.getElementById('qrnc-av').innerHTML = u.avatar ? `<img src="${escapeHTML(u.avatar)}">` : avatarInitial(u.name||'U');
  document.getElementById('qrnc-name').innerHTML = safeName + (vBadge ? ' ' + vBadge : '');

  const unameEl = document.getElementById('qrnc-uname');
  if(u.username){ unameEl.style.display='block'; unameEl.textContent = '@' + u.username; } else unameEl.style.display='none';

  const bioEl = document.getElementById('qrnc-bio');
  if(u.bio){ bioEl.style.display='block'; bioEl.textContent = u.bio; } else bioEl.style.display='none';

  const statsEl = document.getElementById('qrnc-stats');
  const fc = (u.followers && u.followers.length) || 0;
  const fg = (u.following && u.following.length) || 0;
  if(fc || fg){
    statsEl.style.display='flex';
    statsEl.innerHTML = `<div class="qrnc-st"><b>${fc}</b><span>Followers</span></div><div class="qrnc-st"><b>${fg}</b><span>Following</span></div>`;
  } else statsEl.style.display='none';

  const link = qrncProfileLink(u);
  document.getElementById('qrnc-url').textContent = link.replace(/^https?:\/\//,'');

  try{
    await qrncLoadScript(QRNC_LIB_QR);
    const matrix = qrncMakeMatrix(link);
    const logoImg = await qrncLoadImg(u.avatar);     
    const canvas = document.createElement('canvas');
    qrncDrawQR(canvas, matrix, 200, '#1c1a2e', logoImg);
    document.getElementById('qrnc-qr-loading').style.display = 'none';
    frame.insertBefore(canvas, frame.firstChild);
    if(logoImg){
      const lo = document.createElement('img');
      lo.className = 'qrnc-qr-logo'; lo.src = u.avatar; lo.alt='';
      frame.appendChild(lo);
    }
  }catch(e){
    console.error('QR gen failed', e);
    document.getElementById('qrnc-qr-loading').innerHTML = '<span class="material-symbols-outlined" style="animation:none;">wifi_off</span>QR unavailable offline';
  }
}

function qrncCloseCard(){ document.getElementById('qrnc-modal').style.display = 'none'; }

function qrncCopy(){
  const link = qrncCurrentData ? qrncProfileLink(qrncCurrentData) : '';
  if(!link) return;
  const done = () => showToast('Link copied! ');
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(link).then(done).catch(() => qrncFallbackCopy(link, done));
  } else qrncFallbackCopy(link, done);
}
function qrncFallbackCopy(text, cb){
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position='fixed'; ta.style.opacity='0';
  document.body.appendChild(ta); ta.select();
  try{ document.execCommand('copy'); cb && cb(); }catch(e){}
  document.body.removeChild(ta);
}

/* ---------- DOWNLOAD ---------- */
async function qrncDownload(){
  if(!qrncCurrentData) return;
  const u = qrncCurrentData;
  try{
    await qrncLoadScript(QRNC_LIB_QR);
    const link = qrncProfileLink(u);
    const matrix = qrncMakeMatrix(link);

    const W = 1080, H = 1380, pad = 70;
    const cv = document.createElement('canvas');
    const dpr = 2; cv.width = W*dpr; cv.height = H*dpr;
    const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);

    ctx.fillStyle = '#0e0c15'; ctx.fillRect(0,0,W,H);
    const g = ctx.createLinearGradient(0,0,W,420);
    g.addColorStop(0,'#5b3fd6'); g.addColorStop(.55,'#7c5cff'); g.addColorStop(1,'#c084fc');
    ctx.fillStyle = g; ctx.fillRect(0,0,W,440);
    ctx.fillStyle = 'rgba(255,255,255,.10)';
    ctx.beginPath(); ctx.arc(W-120,40,260,0,Math.PI*2); ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.font = '700 30px system-ui, sans-serif';
    ctx.textBaseline = 'middle'; ctx.fillText('  GOCHAT', pad, 70);

    const avImg = await qrncLoadImg(u.avatar);
    const avX = pad, avY = 300, avS = 180;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 12;
    ctx.fillStyle = '#0e0c15'; ctx.beginPath(); ctx.arc(avX+avS/2, avY+avS/2, avS/2+8, 0, Math.PI*2); ctx.fill();
    ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.arc(avX+avS/2, avY+avS/2, avS/2, 0, Math.PI*2); ctx.clip();
    if(avImg){ try{ ctx.drawImage(avImg, avX, avY, avS, avS); }catch(e){ ctx.fillStyle='#7c5cff'; ctx.fill(); } }
    else { ctx.fillStyle='#7c5cff'; ctx.fill(); ctx.fillStyle='#fff'; ctx.font='800 70px system-ui'; ctx.textAlign='center'; ctx.fillText((u.name||'U').trim().charAt(0).toUpperCase(), avX+avS/2, avY+avS/2+4); ctx.textAlign='left'; }
    ctx.restore();

    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ffffff'; ctx.font = '800 52px system-ui, sans-serif';
    const nameX = avX + avS + 36;
    ctx.fillText(qrncTruncate(ctx, u.name||'User', W - nameX - pad), nameX, 360);
    if(u.username){ ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = '700 30px monospace'; ctx.fillText('@'+u.username, nameX, 405); }

    const by = 520;
    ctx.fillStyle = '#ffffff'; qrncRoundRect(ctx, pad, by, W-pad*2, H-by-pad, 36); ctx.fill();

    let cy = by + 70;
    if(u.bio){ ctx.fillStyle = '#5b5870'; ctx.font = '500 30px system-ui, sans-serif'; cy = qrncWrap(ctx, u.bio, pad+50, cy, W-pad*2-100, 42, 2) + 24; }

    const fc = (u.followers&&u.followers.length)||0, fg = (u.following&&u.following.length)||0;
    if(fc || fg){
      ctx.fillStyle = '#1c1a2e'; ctx.font = '800 38px system-ui';
      ctx.fillText(String(fc), pad+50, cy+10);
      ctx.fillStyle = '#928ea8'; ctx.font = '700 24px system-ui'; ctx.fillText('Followers', pad+50+ctx.measureText(String(fc)).width+14, cy+10);
      ctx.fillStyle = '#1c1a2e'; ctx.font = '800 38px system-ui';
      const sx = pad+330; ctx.fillText(String(fg), sx, cy+10);
      ctx.fillStyle = '#928ea8'; ctx.font = '700 24px system-ui'; ctx.fillText('Following', sx+ctx.measureText(String(fg)).width+14, cy+10);
      cy += 60;
    }

    const qpY = cy + 20, qpH = 460;
    ctx.fillStyle = '#f4f2fb'; qrncRoundRect(ctx, pad+40, qpY, W-pad*2-80, qpH, 28); ctx.fill();
    const qrSize = 320, qx = (W-qrSize)/2, qy = qpY + 36;
    ctx.fillStyle = '#fff'; qrncRoundRect(ctx, qx-16, qy-16, qrSize+32, qrSize+32, 18); ctx.fill();
    const qrCv = document.createElement('canvas');
    qrncDrawQR(qrCv, matrix, qrSize, '#1c1a2e', avImg);
    try{ ctx.drawImage(qrCv, qx, qy, qrSize, qrSize); }catch(e){}
    ctx.fillStyle = '#6b6783'; ctx.font = '700 26px system-ui'; ctx.textAlign='center';
    ctx.fillText('Scan to view profile', W/2, qy + qrSize + 56);
    ctx.textAlign = 'left';

    ctx.fillStyle = '#928ea8'; ctx.font = '600 24px monospace'; ctx.textAlign='center';
    ctx.fillText(link.replace(/^https?:\/\//,''), W/2, H - pad - 30);
    ctx.textAlign = 'left';

    cv.toBlob(blob => {
      if(!blob){ showToast('Could not generate image'); return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'GoChat-' + (u.username || u.name || 'card').replace(/\s+/g,'_') + '.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      showToast('Card downloaded! ');
    }, 'image/png');
  }catch(e){ console.error(e); showToast('Download failed  try again'); }
}
function qrncRoundRect(ctx,x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
function qrncTruncate(ctx,t,max){ let s=t; while(ctx.measureText(s).width>max && s.length>1){ s=s.slice(0,-1); } return s.length<t.length? s+'':s; }
function qrncWrap(ctx,t,x,y,maxW,lh,maxL){ const words=t.split(' '); let line='',lines=0; for(const w of words){ const test=line?line+' '+w:w; if(ctx.measureText(test).width>maxW && line){ ctx.fillText(line,x,y); y+=lh; line=w; lines++; if(lines>=maxL){ ctx.fillText(qrncTruncate(ctx,line+' ',maxW),x,y); return y; } } else line=test; } if(line){ ctx.fillText(line,x,y); y+=lh; } return y; }

/* ---------- SHARE ---------- */
async function qrncShare(){
  if(!qrncCurrentData) return;
  const u = qrncCurrentData; const link = qrncProfileLink(u);
  const title = (u.name||'User') + ' on GoChat';
  if(navigator.canShare && navigator.share){
    try{
      await qrncLoadScript(QRNC_LIB_QR);
      const matrix = qrncMakeMatrix(link);
      const qrCv = document.createElement('canvas');
      qrncDrawQR(qrCv, matrix, 360, '#1c1a2e', await qrncLoadImg(u.avatar));
      const blob = await new Promise(r => qrCv.toBlob(r, 'image/png'));
      if(blob){
        const file = new File([blob], 'gochat-qr.png', { type:'image/png' });
        if(navigator.canShare({ files:[file] })){
          await navigator.share({ files:[file], title, text: link });
          return;
        }
      }
    }catch(e){ if(e.name === 'AbortError') return; }
    try{ await navigator.share({ title, text: link }); return; }catch(e){ if(e.name === 'AbortError') return; }
  }
  qrncCopy();   
}

/* ---------- SCANNER ---------- */
async function qrncOpenScanner(){
  const msg = document.getElementById('qrnc-scan-msg');
  msg.className = 'qrnc-scan-msg'; msg.textContent = 'Starting camera';
  document.getElementById('qrnc-scanner').style.display = 'flex';
  const video = document.getElementById('qrnc-video');

  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    msg.className = 'qrnc-scan-msg err';
    msg.textContent = 'Camera not supported here. Use your phone camera app to scan the QR.';
    return;
  }
  try{
    qrncScanStream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment' }, audio:false });
    video.srcObject = qrncScanStream;
    await video.play();
    msg.textContent = 'Point your camera at a GoChat QR code';
    try{ await qrncLoadScript(QRNC_LIB_SCAN); }catch(e){ msg.className='qrnc-scan-msg err'; msg.textContent='Scanner library unavailable offline.'; qrncStopStream(); return; }
    qrncScanLoop();
  }catch(e){
    console.error(e);
    msg.className = 'qrnc-scan-msg err';
    msg.textContent = 'Camera access denied. You can still scan with your phone camera app.';
  }
}
function qrncScanLoop(){
  const video = document.getElementById('qrnc-video');
  const canvas = document.getElementById('qrnc-scan-canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently:true });
  const msg = document.getElementById('qrnc-scan-msg');
  const tick = () => {
    if(!qrncScanStream){ return; }
    if(video.readyState === video.HAVE_ENOUGH_DATA){
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0,0,canvas.width,canvas.height);
      const code = jsQR(img.data, img.width, img.height, { inversionAttempts:'dontInvert' });
      if(code && code.data){
        const m = code.data.match(/[?&]user=([^&]+)/);
        if(m){
          const id = decodeURIComponent(m[1]);
          qrncCloseScanner(); qrncCloseCard();
          if(navigator.vibrate) navigator.vibrate(40);
          showToast('Profile found! Opening');
          setTimeout(() => { if(typeof viewUserProfile === 'function') viewUserProfile(id); }, 250);
          return;
        } else {
          msg.className = 'qrnc-scan-msg err'; msg.textContent = 'Not a GoChat QR code.';
        }
      }
    }
    qrncScanRAF = requestAnimationFrame(tick);
  };
  qrncScanRAF = requestAnimationFrame(tick);
}
function qrncStopStream(){ if(qrncScanStream){ qrncScanStream.getTracks().forEach(t => t.stop()); qrncScanStream = null; } if(qrncScanRAF){ cancelAnimationFrame(qrncScanRAF); qrncScanRAF = null; } }
function qrncCloseScanner(){ qrncStopStream(); const v = document.getElementById('qrnc-video'); if(v) v.srcObject = null; document.getElementById('qrnc-scanner').style.display = 'none'; }

//  HTML       
function openQRCodeModal() {
    if(currentUser) qrncOpenCard(currentUser.uid);
}

function openOtherUserQR() {
    if(currentOtherProfileUid) qrncOpenCard(currentOtherProfileUid);
}

document.addEventListener('keydown', (e) => {
  if(e.key === 'Escape'){
    if(document.getElementById('qrnc-scanner').style.display === 'flex'){ qrncCloseScanner(); return; }
    if(document.getElementById('qrnc-modal').style.display === 'flex'){ qrncCloseCard(); }
  }
});
// �������������������������������������������������������
//  NEW FEATURE  �  mutual-friends  �  2026-08-02  (v2  wrap fix)
// Mutual Friends on Profile (overlap stack + bottom sheet)
// inject-only � SINGLE safe wrap (call, NOT apply)  viewUserProfile 
// privacy-aware (followingPrivacy=onlyme  hide) � own-profile skip � mfCache
// :  Ctrl+F  "mutual-friends"
// �������������������������������������������������������
const mfCache = {};                 // uid -> { mutual:[...], hidden:bool }
let mfCurrentUid = null, mfCurrentList = [];

/* ---------- data + intersection ( ) ---------- */
function mfMyConns(){
  const f = (currentUserData && currentUserData.following) || [];
  const r = (currentUserData && currentUserData.followers) || [];
  return new Set([...f, ...r]);
}
async function mfGetOther(uid){
  if(mfCache[uid] && mfCache[uid] !== 'pending') return mfCache[uid];
  let u = (typeof allUsersCache !== 'undefined' && allUsersCache) ? allUsersCache.find(x => x.id === uid) : null;
  const hasConns = u && ((u.following && u.following.length) || (u.followers && u.followers.length) || u.followingPrivacy);
  if(!u || !hasConns){
    try{ const d = await db.collection('users').doc(uid).get(); if(d.exists) u = Object.assign({ id: uid }, d.data()); }catch(e){}
  }
  if(!u){ mfCache[uid] = { mutual:[], hidden:false }; return mfCache[uid]; }

  // privacy:  following   mutual  
  if(u.followingPrivacy === 'onlyme'){ mfCache[uid] = { mutual:[], hidden:true }; return mfCache[uid]; }

  const mySet = mfMyConns();
  const otherSet = new Set([...(u.following||[]), ...(u.followers||[])]);
  const commonIds = [...mySet].filter(id => id !== uid && otherSet.has(id));

  const objs = [], missing = [];
  commonIds.forEach(id => {
    const c = (typeof allUsersCache !== 'undefined' && allUsersCache) ? allUsersCache.find(x => x.id === id) : null;
    if(c) objs.push(Object.assign({ id }, c)); else missing.push(id);
  });
  if(missing.length){
    try{
      const docs = await Promise.all(missing.map(id => db.collection('users').doc(id).get().catch(()=>null)));
      docs.forEach((d, i) => { if(d && d.exists) objs.push(Object.assign({ id: missing[i] }, d.data())); });
    }catch(e){}
  }
  mfCache[uid] = { mutual: objs, hidden:false };
  return mfCache[uid];
}

/* ---------- strip render ---------- */
async function mfRenderStrip(uid){
  const page = document.getElementById('page-other-profile');
  if(!page) return;
  if(!currentUser || uid === currentUser.uid) return;          //    

  const old = page.querySelector('.mf-strip');
  if(old && old.dataset.mfUid === uid) return;                // same uid  
  if(old) old.remove();

  const res = await mfGetOther(uid);
  if(!res || res.hidden || res.mutual.length === 0) return;   //   / private  strip 

  const list = res.mutual;
  const shown = list.slice(0, 4);
  const extra = list.length - shown.length;

  const avHtml = shown.map(m => {
    const inner = m.avatar ? `<img src="${escapeHTML(m.avatar)}">` : escapeHTML((m.name||'?').trim().charAt(0).toUpperCase());
    return `<div class="mf-av">${inner}</div>`;
  }).join('') + (extra > 0 ? `<div class="mf-av mf-plus">+${extra}</div>` : '');

  const nm = list.map(m => m.name || 'User');
  let namesLine;
  if(list.length <= 3){ namesLine = nm.map(n => `<b>${escapeHTML(n)}</b>`).join(', '); }
  else { namesLine = nm.slice(0,2).map(n => `<b>${escapeHTML(n)}</b>`).join(', ') + ` +${list.length-2}`; }

  const strip = document.createElement('div');
  strip.className = 'mf-strip'; strip.dataset.mfUid = uid;
  strip.setAttribute('role','button'); strip.setAttribute('tabindex','0');
  strip.innerHTML = `
    <div class="mf-stack">${avHtml}</div>
    <div class="mf-text">
      <div class="mf-top"><span class="mf-count">${list.length}</span><span class="mf-label">Mutual</span></div>
      <div class="mf-names">${namesLine}</div>
    </div>
    <div class="mf-go"><span class="material-symbols-outlined">chevron_right</span></div>`;
  strip.onclick = () => mfOpenSheet(uid);
  strip.onkeydown = (e) => { if(e.key==='Enter'||e.key===' '){ e.preventDefault(); mfOpenSheet(uid); } };

  // anchor: Follow/Message row- 
  const btns = page.querySelector('#other-profile-btns');
  if(btns){ btns.parentNode.insertBefore(strip, btns); }
  else {
    const bio = page.querySelector('#other-profile-bio');
    const info = page.querySelector('.profile-info-col, .profile-header');
    (bio || info)?.insertAdjacentElement('afterend', strip);
  }
}

/* ---------- bottom sheet ---------- */
function mfBuildSheet(){
  if(document.getElementById('mf-sheet')) return;
  const ov = document.createElement('div');
  ov.className = 'modal-overlay mf-sheet'; ov.id = 'mf-sheet'; ov.style.display = 'none';
  ov.onclick = (e) => { if(e.target === ov) mfCloseSheet(); };
  ov.innerHTML = `
    <div class="mf-box">
      <div class="mf-handle"></div>
      <div class="mf-sheet-head">
        <div class="mf-sh-ico"><span class="material-symbols-outlined">group</span></div>
        <div class="mf-sh-t">
          <div class="mf-sh-title" id="mf-sh-title">Mutual Connections</div>
          <div class="mf-sh-sub" id="mf-sh-sub">People you both know</div>
        </div>
        <button class="mf-sh-close" onclick="mfCloseSheet()"><span class="material-symbols-outlined">close</span></button>
      </div>
      <div class="mf-search">
        <span class="material-symbols-outlined">search</span>
        <input type="text" id="mf-search-input" placeholder="Search mutual friends" oninput="mfFilter(this.value)">
      </div>
      <div class="mf-list" id="mf-list"></div>
    </div>`;
  document.body.appendChild(ov);
}
async function mfOpenSheet(uid){
  mfBuildSheet();
  mfCurrentUid = uid;
  const ov = document.getElementById('mf-sheet');
  ov.style.display = 'flex';
  document.getElementById('mf-search-input').value = '';
  document.getElementById('mf-list').innerHTML = '<div class="mf-empty"><span class="material-symbols-outlined">progress_activity</span><div class="mf-e-t">Loading</div></div>';

  const res = await mfGetOther(uid);
  mfCurrentList = (res && res.mutual) ? res.mutual : [];
  document.getElementById('mf-sh-title').textContent = mfCurrentList.length + ' Mutual Connection' + (mfCurrentList.length===1?'':'s');
  const other = (typeof allUsersCache!=='undefined'&&allUsersCache)?allUsersCache.find(x=>x.id===uid):null;
  document.getElementById('mf-sh-sub').textContent = other ? ('Shared with ' + (other.name||'this profile')) : 'People you both know';
  mfRenderList(mfCurrentList);
}
function mfCloseSheet(){ const ov = document.getElementById('mf-sheet'); if(ov) ov.style.display = 'none'; }

function mfRenderList(arr){
  const box = document.getElementById('mf-list'); if(!box) return;
  if(!arr.length){ box.innerHTML = '<div class="mf-empty"><span class="material-symbols-outlined">person_search</span><div class="mf-e-t">No matches</div></div>'; return; }
  const myFollowing = new Set((currentUserData && currentUserData.following) || []);
  box.innerHTML = arr.map((m, i) => {
    const av = m.avatar ? `<img src="${escapeHTML(m.avatar)}">` : escapeHTML((m.name||'?').trim().charAt(0).toUpperCase());
    const vBadge = (typeof getVerifiedBadge === 'function') ? (getVerifiedBadge(m.email, m.isVerified) || '') : '';
    const uname = m.username ? `<div class="mf-r-uname">@${escapeHTML(m.username)}</div>` : '';
    const following = myFollowing.has(m.id);
    const status = following ? `<span class="mf-r-status">Following</span>` : '';
    return `<div class="mf-row" style="animation-delay:${Math.min(i*0.04,0.5).toFixed(2)}s" onclick="mfViewFromList('${m.id}')">
      <div class="mf-r-av">${av}</div>
      <div class="mf-r-info">
        <div class="mf-r-name">${escapeHTML(m.name||'User')}${vBadge?' '+vBadge:''}</div>
        ${uname}
      </div>
      ${status}
      <div class="mf-r-chev"><span class="material-symbols-outlined">chevron_right</span></div>
    </div>`;
  }).join('');
}
function mfFilter(q){
  const t = (q||'').trim().toLowerCase();
  const arr = !t ? mfCurrentList : mfCurrentList.filter(m => (m.name||'').toLowerCase().includes(t) || (m.username||'').toLowerCase().includes(t));
  mfRenderList(arr);
}
function mfViewFromList(uid){
  mfCloseSheet();
  if(typeof closeUserProfile === 'function') closeUserProfile();
  setTimeout(() => { if(typeof viewUserProfile === 'function') viewUserProfile(uid); }, 120);
}

/* ----------  SINGLE safe wrap: orig.CALL (not apply)  viewUserProfile %  ---------- */
(function mfHookView(){
  if(typeof window.viewUserProfile !== 'function' || window.viewUserProfile.__mfWrapped) return;
  const orig = window.viewUserProfile;
  window.viewUserProfile = function(uid, ...rest){
    const r = orig.call(this, uid, ...rest);          //  : call,  uid  
    if(uid && (typeof currentUser === 'undefined' || !currentUser || uid !== currentUser.uid)){
      setTimeout(() => mfRenderStrip(uid), 320);
    }
    return r;
  };
  window.viewUserProfile.__mfWrapped = true;
})();

/* ESC  sheet  */
document.addEventListener('keydown', (e) => {
  if(e.key === 'Escape'){ const ov = document.getElementById('mf-sheet'); if(ov && ov.style.display === 'flex') mfCloseSheet(); }
});
// =========================================
//  COMMENT IMAGE UPLOAD SYSTEM
// =========================================
let selectedCommentImage = null;

//     
function previewCommentImage(input) {
    const file = input.files[0];
    if (file) {
        selectedCommentImage = file;
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('comment-preview-img').src = e.target.result;
            document.getElementById('comment-image-preview').style.display = 'block';
        }
        reader.readAsDataURL(file);
    }
}

//       
function removeCommentImage() {
    selectedCommentImage = null;
    document.getElementById('comment-img-input').value = '';
    document.getElementById('comment-image-preview').style.display = 'none';
    document.getElementById('comment-preview-img').src = '';
}

//  ( + )   
async function sendCommentWithImage() {
    if (!activeCommentPostId || !currentUser) return;
    
    const inputEl = document.getElementById('comment-panel-input');
    const text = inputEl.value.trim();
    const btnEl = document.getElementById('comment-panel-send-btn');
    
    //       
    if (!text && !selectedCommentImage) return; 
    
    btnEl.disabled = true;
    btnEl.innerHTML = '<span class="material-symbols-outlined" style="font-size:20px; animation:spin 1s linear infinite;">autorenew</span>';
    
    let imageUrl = null;
    if (selectedCommentImage) {
        showToast("Uploading image...");
        try {
            //     Cloudinary     
            imageUrl = await uploadToCloudinary(selectedCommentImage, false);
        } catch(e) {
            showToast("Failed to upload image");
            btnEl.disabled = false;
            btnEl.innerHTML = '<i class="ph-bold ph-paper-plane-right" style="font-size:22px;"></i>';
            return;
        }
    }
    
    const newComment = {
        uid: currentUser.uid,
        name: currentUserData.name,
        text: text,
        imageUrl: imageUrl, //      
        time: Date.now(),
        likes: 0,
        dislikes: 0,
        likedBy: [],
        dislikedBy: [],
        replies: []
    };

    try {
        const ref = db.collection('posts').doc(activeCommentPostId);
        const docSnap = await ref.get();
        if(docSnap.exists) {
            let comments = docSnap.data().comments || [];
            comments.push(newComment);
            await ref.update({ comments });
            
            //  
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
                awardPoints(docSnap.data().uid, 5);
            }
        }
        
        //     
        inputEl.value = '';
        removeCommentImage();
        showToast("Comment added!");
        
    } catch(e) {
        console.log(e);
        showToast("Error adding comment");
    }
    
    btnEl.disabled = false;
    btnEl.innerHTML = '<i class="ph-bold ph-paper-plane-right" style="font-size:22px;"></i>';
}
// =========================================
//  EXPORT CHAT OFFLINE (Zero Server Cost)
// =========================================
function exportCurrentChat() {
    if (!currentChatId) return;
    
    // -   
    const menu = document.getElementById('chat-delete-menu');
    if(menu) menu.style.display = 'none';

    const chatName = document.getElementById('chat-name-display').innerText || 'Chat';
    const msgElements = document.querySelectorAll('#chat-messages .chat-bubble-wrapper');
    
    if (msgElements.length === 0) {
        showToast("No messages to export!");
        return;
    }

    showToast("Preparing chat history...");

    let chatText = `--- GoChat Export: ${chatName} ---\nExported on: ${new Date().toLocaleString()}\n\n`;

    //       
    msgElements.forEach(wrapper => {
        const isMine = wrapper.classList.contains('mine');
        const bubble = wrapper.querySelector('.chat-bubble');
        if (!bubble) return;
        
        let textContent = bubble.innerText.trim().replace(/\n/g, ' ');
        if(bubble.querySelector('img')) textContent += ' [Image Attachment]';
        if(bubble.querySelector('video')) textContent += ' [Video Attachment]';
        if(bubble.querySelector('audio')) textContent += ' [Voice Message]';

        const sender = isMine ? 'Me' : chatName;
        chatText += `${sender}: ${textContent}\n`;
    });

    //  NEW:     ,      
    //          (  )
    
    //      ,  
    const oldModal = document.getElementById('export-chat-modal');
    if (oldModal) oldModal.remove();

    //   
    const exportModal = document.createElement('div');
    exportModal.id = 'export-chat-modal';
    exportModal.style.cssText = `
        position: fixed; inset: 0; background: var(--bg); z-index: 100010; 
        display: flex; flex-direction: column; animation: slideUp 0.3s ease;
    `;

    exportModal.innerHTML = `
        <div class="chat-topbar" style="position: sticky; top: 0; z-index: 10;">
            <div class="chat-back" onclick="document.getElementById('export-chat-modal').remove()"><span class="material-symbols-outlined">close</span></div>
            <div class="chat-name" style="font-weight: 800; font-size: 16px;">Exported Chat</div>
            <button class="btn-primary" style="margin:0; padding:6px 12px; width:auto; border-radius:20px; font-size:13px;" onclick="navigator.clipboard.writeText(document.getElementById('exported-chat-text').value); showToast('Copied to clipboard!');">Copy All</button>
        </div>
        <div style="padding: 16px; flex: 1; display: flex; flex-direction: column;">
            <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 12px;">Here is your chat history with <b>${escapeHTML(chatName)}</b>. You can copy this text and save it anywhere.</p>
            <textarea id="exported-chat-text" readonly style="flex: 1; width: 100%; background: var(--surface-2); border: 1px solid var(--border); border-radius: 12px; color: var(--text); padding: 16px; font-size: 14px; font-family: monospace; resize: none; outline: none; line-height: 1.6;">${chatText}</textarea>
        </div>
    `;

    document.body.appendChild(exportModal);
}
// �������������������������������������������������������
//  NEW FEATURE  �  quick-reply-templates  �  2026-08-02
// Quick Reply Templates (localStorage-)
// :  Ctrl+F  "quick-reply-templates"
// ������������������������������������������������������
const QR_STORAGE_KEY = 'gochat_quick_replies';
let qrEditIndex = null;

/* ----------   ---------- */
function qrGetTemplates(){
  try{
    const data = localStorage.getItem(QR_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  }catch(e){ return []; }
}
function qrSaveTemplates(templates){
  try{
    localStorage.setItem(QR_STORAGE_KEY, JSON.stringify(templates));
  }catch(e){ showToast('Failed to save template'); }
}
function qrAddTemplate(text){
  const templates = qrGetTemplates();
  templates.push({ text, createdAt: Date.now() });
  qrSaveTemplates(templates);
}
function qrDeleteTemplate(index){
  const templates = qrGetTemplates();
  templates.splice(index, 1);
  qrSaveTemplates(templates);
}
function qrUpdateTemplate(index, text){
  const templates = qrGetTemplates();
  if(templates[index]) templates[index].text = text;
  qrSaveTemplates(templates);
}

/* ----------      ---------- */
function qrInjectChatButton(){
  const inputBar = document.querySelector('.chat-input-bar');
  if(!inputBar || inputBar.querySelector('.qr-trigger')) return;
  
  const btn = document.createElement('button');
  btn.className = 'qr-trigger';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Quick Replies');
  btn.title = 'Quick Replies';
  btn.innerHTML = '<span class="material-symbols-outlined">bolt</span>';
  btn.onclick = (e) => { e.stopPropagation(); qrToggleChips(); };
  
  //   
  const input = inputBar.querySelector('input');
  if(input){ inputBar.insertBefore(btn, input); }
  else{ inputBar.appendChild(btn); }
}

/* ----------   ---------- */
function qrToggleChips(){
  const popup = document.getElementById('qr-chips-popup');
  if(!popup){ qrBuildChipsPopup(); }
  const p = document.getElementById('qr-chips-popup');
  if(p.classList.contains('open')){ p.classList.remove('open'); }
  else{ qrRenderChips(); p.classList.add('open'); }
}
function qrBuildChipsPopup(){
  if(document.getElementById('qr-chips-popup')) return;
  
  const popup = document.createElement('div');
  popup.id = 'qr-chips-popup';
  popup.className = 'qr-chips-popup';
  popup.innerHTML = `
    <div class="qr-chips-header">
      <div class="qr-title"><span class="material-symbols-outlined">bolt</span> Quick Replies</div>
      <button class="qr-close" onclick="qrToggleChips()"><span class="material-symbols-outlined">close</span></button>
    </div>
    <div class="qr-chips-list" id="qr-chips-list"></div>
    <div class="qr-chips-footer">
      <button class="qr-manage" onclick="qrOpenManage()">Manage</button>
    </div>
  `;
  
  //   
  const chatScreen = document.getElementById('chat-screen');
  if(chatScreen){ chatScreen.appendChild(popup); }
  
  //   
  document.addEventListener('click', (e) => {
    if(popup && !popup.contains(e.target) && !e.target.closest('.qr-trigger')){
      popup.classList.remove('open');
    }
  });
}
function qrRenderChips(){
  const list = document.getElementById('qr-chips-list');
  if(!list) return;
  
  const templates = qrGetTemplates();
  if(templates.length === 0){
    list.innerHTML = `<div class="qr-chips-empty"><span class="material-symbols-outlined">inbox</span><div>No quick replies yet</div></div>`;
    return;
  }
  
  list.innerHTML = templates.map((t, i) => `
    <div class="qr-chip-item" style="animation-delay:${i*0.04}s" onclick="qrUseTemplate(${i})">
      <div class="qr-text">${escapeHTML(t.text)}</div>
      <div class="qr-actions">
        <button class="qr-del" onclick="event.stopPropagation(); qrDeleteFromChips(${i})"><span class="material-symbols-outlined">delete</span></button>
      </div>
    </div>
  `).join('');
}
function qrUseTemplate(index){
  const templates = qrGetTemplates();
  if(!templates[index]) return;
  
  const input = document.getElementById('chat-input');
  if(input){
    input.value = templates[index].text;
    input.focus();
    //    
    const len = input.value.length;
    input.setSelectionRange(len, len);
  }
  
  document.getElementById('qr-chips-popup').classList.remove('open');
  showToast('Template inserted');
}
function qrDeleteFromChips(index){
  qrDeleteTemplate(index);
  qrRenderChips();
  showToast('Template deleted');
}

/* ---------- Manage Screen () ---------- */
function qrOpenManage(){
  document.getElementById('qr-chips-popup').classList.remove('open');
  const screen = document.getElementById('qr-manage-screen');
  screen.classList.add('open');
  qrRenderManageList();
}
function qrCloseManage(){
  document.getElementById('qr-manage-screen').classList.remove('open');
}
function qrRenderManageList(){
  const list = document.getElementById('qr-manage-list');
  if(!list) return;
  
  const templates = qrGetTemplates();
  if(templates.length === 0){
    list.innerHTML = `
      <div class="qr-manage-empty">
        <span class="material-symbols-outlined">bolt</span>
        <div class="qr-e-t">No quick replies yet</div>
        <div class="qr-e-s">Tap "New" to create your first quick reply template.</div>
      </div>
    `;
    return;
  }
  
  list.innerHTML = templates.map((t, i) => `
    <div class="qr-manage-item" style="animation-delay:${i*0.04}s">
      <div class="qr-m-text">
        <div class="qr-m-txt">${escapeHTML(t.text)}</div>
        <div class="qr-m-meta">${new Date(t.createdAt).toLocaleString()}</div>
      </div>
      <div class="qr-m-actions">
        <button class="qr-m-btn qr-edit" onclick="qrEditItem(${i})"><span class="material-symbols-outlined">edit</span></button>
        <button class="qr-m-btn qr-delete" onclick="qrDeleteItem(${i})"><span class="material-symbols-outlined">delete</span></button>
      </div>
    </div>
  `).join('');
}
function qrEditItem(index){
  qrEditIndex = index;
  const templates = qrGetTemplates();
  const modal = document.getElementById('qr-editor-modal');
  const title = document.getElementById('qr-editor-title');
  const text = document.getElementById('qr-editor-text');
  
  title.textContent = 'Edit Quick Reply';
  text.value = templates[index].text;
  modal.classList.add('open');
}
function qrDeleteItem(index){
  if(!confirm('Delete this quick reply?')) return;
  qrDeleteTemplate(index);
  qrRenderManageList();
  showToast('Template deleted');
}

/* ---------- Editor Modal ---------- */
function qrOpenEditor(index = null){
  qrEditIndex = index;
  const modal = document.getElementById('qr-editor-modal');
  const title = document.getElementById('qr-editor-title');
  const text = document.getElementById('qr-editor-text');
  
  if(index === null){
    title.textContent = 'New Quick Reply';
    text.value = '';
  }
  
  modal.classList.add('open');
  setTimeout(() => text.focus(), 100);
}
function qrCloseEditor(){
  document.getElementById('qr-editor-modal').classList.remove('open');
  qrEditIndex = null;
}
function qrSaveTemplate(){
  const text = document.getElementById('qr-editor-text').value.trim();
  if(!text){ showToast('Please enter some text'); return; }
  if(text.length > 200){ showToast('Text is too long (max 200 chars)'); return; }
  
  if(qrEditIndex !== null){
    qrUpdateTemplate(qrEditIndex, text);
    showToast('Template updated');
  }else{
    qrAddTemplate(text);
    showToast('Template saved');
  }
  
  qrCloseEditor();
  qrRenderManageList();
}

/* ----------     ---------- */
function qrAddToSettings(){
  const menu = document.querySelector('.settings-list');
  if(!menu || menu.querySelector('.qr-settings-item')) return;
  
  const item = document.createElement('div');
  item.className = 'setting-item qr-settings-item';
  item.innerHTML = '<span class="material-symbols-outlined">bolt</span> Quick Replies';
  item.onclick = () => qrOpenManage();
  
  //     
  const refItem = [...menu.querySelectorAll('.setting-item')].find(i => /notification|privacy/i.test(i.textContent));
  if(refItem){ refItem.parentNode.insertBefore(item, refItem); }
  else{ menu.appendChild(item); }
}

/* ---------- Boot ---------- */
(function qrBoot(){
  //   
  const addSettings = () => {
    if(document.querySelector('.settings-list')) qrAddToSettings();
  };
  
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addSettings); else addSettings();
  setTimeout(addSettings, 800);
  
  //     
  if(typeof window.openChat === 'function' && !window.openChat.__qrWrapped){
    const orig = window.openChat;
    window.openChat = function(...args){
      const r = orig.apply(this, args);
      setTimeout(() => qrInjectChatButton(), 300);
      return r;
    };
    window.openChat.__qrWrapped = true;
  }
  
  // ESC   
  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape'){
      const chips = document.getElementById('qr-chips-popup');
      if(chips && chips.classList.contains('open')) chips.classList.remove('open');
      const manage = document.getElementById('qr-manage-screen');
      if(manage && manage.classList.contains('open')) qrCloseManage();
      const editor = document.getElementById('qr-editor-modal');
      if(editor && editor.classList.contains('open')) qrCloseEditor();
    }
  });
})();
// �������������������������������������������������������
//  NEW FEATURE  �  post-templates  �  2026-08-02
// Post Templates  one-tap ready text + matching background
//      POST_TEMPLATES    
// :  Ctrl+F  "post-templates"
// �������������������������������������������������������
const PT_CATS = [
  { key:'all',       label:' All' },
  { key:'celebrate', label:' Celebrate' },
  { key:'announce',  label:' Announce' },
  { key:'quotes',    label:' Quotes' },
  { key:'question',  label:' Questions' },
  { key:'promo',     label:' Promo' }
];
const POST_TEMPLATES = [
  { cat:'celebrate', emoji:'', title:'Birthday Wish', bg:'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    text:' Happy Birthday! \nWishing you a day full of love, laughter and blessings. May this year bring you endless happiness! ' },
  { cat:'celebrate', emoji:'', title:'Congratulations', bg:'linear-gradient(135deg, #fbbf24, #d97706)',
    text:' Congratulations! So proud of you  you truly deserve this moment! ' },
  { cat:'celebrate', emoji:'', title:'Anniversary', bg:'linear-gradient(135deg, #eb3349, #f45c43)',
    text:' Happy Anniversary! May your bond grow stronger with every passing year. ' },
  { cat:'announce', emoji:'', title:'Big Announcement', bg:'linear-gradient(to right, #4facfe 0%, #00f2fe 100%)',
    text:' Big news coming soon! Stay tuned something special is on the way! ' },
  { cat:'announce', emoji:'', title:'Life Update', bg:'default',
    text:' Life update: [   ] ' },
  { cat:'announce', emoji:'', title:'Thank You', bg:'linear-gradient(to right, #fa709a 0%, #fee140 100%)',
    text:' Thank you all for your love and support! I\'m truly grateful. ' },
  { cat:'quotes', emoji:'', title:'Quote of the Day', bg:'default',
    text:' "Dream big. Work hard. Stay humble." ' },
  { cat:'quotes', emoji:'', title:'Motivation', bg:'linear-gradient(135deg, #1a1a2e, #4a00e0)',
    text:' Don\'t stop until you\'re proud.' },
  { cat:'quotes', emoji:'', title:'Late Night Thought', bg:'linear-gradient(to right, #0f2027, #203a43, #2c5364)',
    text:' Some thoughts only make sense at 2 AM' },
  { cat:'question', emoji:'', title:'Ask Me Anything', bg:'linear-gradient(to right, #00b09b, #96c93d)',
    text:' Ask me anything in the comments! I\'ll answer everyone ' },
  { cat:'question', emoji:'', title:'This or That?', bg:'linear-gradient(135deg, #8e2de2, #4a00e0)',
    text:' This or that? Drop your choice below! ' },
  { cat:'question', emoji:'', title:'Need Your Advice', bg:'default',
    text:' I need your advice! What would you do in my place? ' },
  { cat:'promo', emoji:'', title:'New Drop Alert', bg:'linear-gradient(135deg, #f83600 0%, #f9d423 100%)',
    text:' New drop alert!  Check out what I\'ve been working on DM to order! ' },
  { cat:'promo', emoji:'', title:'Photo Dump', bg:'default',
    text:' Little moments, big memories. Swipe through my week! ' },
  { cat:'promo', emoji:'', title:'Good Morning', bg:'linear-gradient(135deg, #ff9d8c 0%, #3d7eaa 100%)',
    text:' Good morning!  May your day be as warm as your coffee. ' }
];
let ptActiveCat = 'all';

function ptBuild(){
  if(document.getElementById('pt-sheet')) return;
  const ov = document.createElement('div');
  ov.id = 'pt-sheet'; ov.className = 'modal-overlay'; ov.style.zIndex = '100016';
  ov.onclick = (e) => { if(e.target === ov) ptClose(); };
  ov.innerHTML = `
  <div class="pt-box">
    <div class="pt-handle"></div>
    <div class="pt-head">
      <div class="pt-head-ico"><span class="material-symbols-outlined">auto_awesome</span></div>
      <div style="flex:1;min-width:0;">
        <div class="pt-title-big">Post Templates</div>
        <div class="pt-sub">Tap a template  text & background apply instantly</div>
      </div>
      <button class="pt-close" onclick="ptClose()"><span class="material-symbols-outlined">close</span></button>
    </div>
    <div class="pt-cats" id="pt-cats"></div>
    <div class="pt-list" id="pt-list"></div>
  </div>`;
  document.body.appendChild(ov);
}
function ptOpen(){ ptBuild(); document.getElementById('pt-sheet').classList.add('open'); ptRender(); }
function ptClose(){ const ov = document.getElementById('pt-sheet'); if(ov) ov.classList.remove('open'); }
function ptSetCat(k){ ptActiveCat = k; ptRender(); }

function ptRender(){
  const cats = document.getElementById('pt-cats');
  const list = document.getElementById('pt-list');
  if(!cats || !list) return;
  cats.innerHTML = PT_CATS.map(c =>
    `<button class="pt-chip ${c.key===ptActiveCat?'active':''}" onclick="ptSetCat('${c.key}')">${c.label}</button>`
  ).join('');
  const items = POST_TEMPLATES.map((t,i)=>({t,i})).filter(x => ptActiveCat==='all' || x.t.cat===ptActiveCat);
  list.innerHTML = items.map((x, idx) => `
    <div class="pt-card" style="animation-delay:${(idx*0.03).toFixed(2)}s" onclick="ptApply(${x.i})">
      <div class="pt-emoji">${x.t.emoji}</div>
      <div class="pt-body">
        <div class="pt-title">${escapeHTML(x.t.title)}</div>
        <div class="pt-preview">${escapeHTML(x.t.text.replace(/\n/g,' '))}</div>
      </div>
      <div class="pt-side">
        ${x.t.bg && x.t.bg!=='default' ? `<span class="pt-bgdot" style="background:${x.t.bg}"></span>` : ''}
        <span class="material-symbols-outlined pt-go">add_circle</span>
      </div>
    </div>`).join('');
}

function ptApply(i){
  const t = POST_TEMPLATES[i]; if(!t) return;
  const ta = document.getElementById('post-title'); if(!ta) return;
  const cur = ta.value.trim();
  ta.value = cur ? cur + '\n\n' + t.text : t.text;   //   ,   
  if(typeof selectPostBg === 'function' && t.bg) selectPostBg(t.bg, null);
  if(typeof checkPostInputs === 'function') checkPostInputs();
  ptClose();
  showToast('Template applied ');
}

/* "Add to your post"   auto-inject */
(function ptInject(){
  const inject = () => {
    const palette = document.querySelector('label[onclick="toggleColorPicker()"]');
    if(!palette || document.getElementById('pt-open-btn')) return;
    const row = palette.parentElement;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.id = 'pt-open-btn'; btn.className = 'pt-open-btn';
    btn.title = 'Post Templates';
    btn.onclick = (e) => { e.stopPropagation(); ptOpen(); };
    btn.innerHTML = '<i class="ph-bold ph-notebook" style="font-size:22px;"></i>';
    row.insertBefore(btn, palette);
  };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject); else inject();
  setTimeout(inject, 600); setTimeout(inject, 1500);
})();

/* ESC-   */
document.addEventListener('keydown', (e) => {
  if(e.key === 'Escape'){ const ov = document.getElementById('pt-sheet'); if(ov) ov.classList.remove('open'); }
});
// ������������������������������������������������������
//  UPDATE  �  home-sidebar-v2  �  2026-08-05
// ������������������������������������������������������

// Sidebar open/close
function openHomeSidebar() {
  document.getElementById('home-sidebar').classList.add('open');
  document.getElementById('sidebar-backdrop').classList.add('show');
}

function closeHomeSidebar() {
  document.getElementById('home-sidebar').classList.remove('open');
  document.getElementById('sidebar-backdrop').classList.remove('show');
}

// Sidebar tab switch (For You / Following)
function switchSidebarTab(tab) {
  // Update sidebar tabs
  document.querySelectorAll('.sb-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('sb-tab-' + tab).classList.add('active');
  
  // Feed tab change
  currentFeedTab = tab;
  postLimit = 10;
  
  // Update original feed tabs (hidden but synced)
  document.querySelectorAll('.feed-tab').forEach(t => t.classList.remove('active'));
  const tabEl = document.getElementById('tab-' + tab);
  if (tabEl) tabEl.classList.add('active');
  
  loadFeed();
  closeHomeSidebar();
}

// Show menu button only on home feed
function updateMenuButton() {
  const menuBtn = document.getElementById('menu-btn');
  const feedPage = document.getElementById('page-feed');
  
  if (feedPage && feedPage.classList.contains('active')) {
    menuBtn.classList.add('show');
    document.body.classList.add('feed-mode');
  } else {
    menuBtn.classList.remove('show');
    document.body.classList.remove('feed-mode');
  }
}

// Override showPage to update menu button
const originalShowPage = window.showPage;
window.showPage = function(page) {
  if (typeof originalShowPage === 'function') {
    originalShowPage(page);
  }
  updateMenuButton();
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  updateMenuButton();
});