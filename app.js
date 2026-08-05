// ==========================================
// 1. FIREBASE CONFIGURATION & INIT
// ==========================================
//           [span_1](start_span)[span_1](end_span)
firebase.initializeApp({
    apiKey: "AIzaSyAnKueAHG8cw6O-Hy8U9fgGzH4fDMYQBy8",
    authDomain: "gochat-3efa3.firebaseapp.com",
    projectId: "gochat-3efa3",
    storageBucket: "gochat-3efa3.firebasestorage.app",
    messagingSenderId: "203332487017",
    appId: "1:203332487017:web:06af0b8b4b12af89581ff8"
});

const auth = firebase.auth();
const db = firebase.firestore();

//          
db.settings({ experimentalForceLongPolling: true });

// ==========================================
// 2. GLOBAL VARIABLES
// ==========================================
let currentUser = null;
let currentUserData = null;

// ==========================================
// 3. UTILITY & NAVIGATION FUNCTIONS
// ==========================================
function showToast(msg) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

//     
function togglePasswordVisibility() {
    const input = document.getElementById('auth-password');
    const icon = document.getElementById('toggle-eye');
    if (input.type === 'password') {
        input.type = 'text';
        icon.textContent = 'visibility_off';
    } else {
        input.type = 'password';
        icon.textContent = 'visibility';
    }
}

//     
function showLogin() {
    document.getElementById('registration-steps').style.display = 'none';
    document.getElementById('login-form').style.display = 'block';
}

function showRegister() {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('registration-steps').style.display = 'block';
}

//     
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    const page = document.getElementById('page-' + pageId);
    const nav = document.getElementById('nav-' + pageId);
    
    if (page) page.classList.add('active');
    if (nav) nav.classList.add('active');
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ==========================================
// 4. AUTHENTICATION (LOGIN & REGISTER)
// ==========================================
async function registerWithEmail() {
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const pass = document.getElementById('reg-pass').value;

    if (!name || !email || !pass) { 
        showToast("Please fill all fields!"); 
        return; 
    }
    if (pass.length < 6) { 
        showToast("Password must be at least 6 characters"); 
        return; 
    }

    showToast("Creating account...");
    try {
        const res = await auth.createUserWithEmailAndPassword(email, pass);
        //       
        await db.collection('users').doc(res.user.uid).set({
            name: name,
            email: email,
            avatar: '',
            bio: '',
            followers: [],
            following: [],
            points: 20, //  
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast("Account created successfully!");
    } catch (e) {
        showToast("Error: " + e.message);
    }
}

async function loginWithEmail() {
    const email = document.getElementById('auth-email').value.trim();
    const pass = document.getElementById('auth-password').value;

    if (!email || !pass) { 
        showToast("Enter email and password!"); 
        return; 
    }

    showToast("Logging in...");
    try {
        await auth.signInWithEmailAndPassword(email, pass);
        document.getElementById('auth-password').value = '';
        showToast("Welcome back!");
    } catch (e) {
        showToast("Login failed: " + e.message);
    }
}

// ==========================================
// 5. AUTHENTICATION STATE LISTENER
// ==========================================
auth.onAuthStateChanged(async (user) => {
    const splash = document.getElementById('splash-screen');
    const authScreen = document.getElementById('auth-screen');
    const appScreen = document.getElementById('app-screen');

    if (user) {
        //      
        currentUser = user;
        try {
            const doc = await db.collection('users').doc(user.uid).get();
            if (doc.exists) {
                currentUserData = doc.data();
            }
        } catch (e) { 
            console.error("Error fetching user data:", e); 
        }

        authScreen.style.display = 'none';
        appScreen.style.display = 'block';
        
        //       
        setTimeout(() => { if (splash) splash.style.opacity = '0'; setTimeout(() => splash.style.display = 'none', 500); }, 1000);
        
    } else {
        //     
        currentUser = null;
        currentUserData = null;
        appScreen.style.display = 'none';
        authScreen.style.display = 'flex';
        
        setTimeout(() => { if (splash) splash.style.opacity = '0'; setTimeout(() => splash.style.display = 'none', 500); }, 500);
    }
});
// ==========================================
// 6. POST CREATION SYSTEM
// ==========================================
function openCreatePost() {
    document.getElementById('create-post-modal').style.display = 'flex';
}

function closeCreatePost() {
    document.getElementById('create-post-modal').style.display = 'none';
    document.getElementById('post-input-text').value = '';
}

async function submitPost() {
    const text = document.getElementById('post-input-text').value.trim();
    if (!text || !currentUser) return;

    showToast("Posting...");
    try {
        //     
        await db.collection('posts').add({
            uid: currentUser.uid,
            name: currentUserData.name || 'User',
            avatar: currentUserData.avatar || '',
            title: text,
            likes: 0,
            likedBy: [],
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        closeCreatePost();
        showToast("Posted successfully!");
    } catch (e) {
        showToast("Error: " + e.message);
    }
}

// ==========================================
// 7. REAL-TIME HOME FEED & LIKES
// ==========================================
let feedUnsub = null;

function loadFeed() {
    const feedList = document.getElementById('feed-list');
    if (!feedList) return;

    feedList.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-muted);"><span class="material-symbols-outlined" style="animation: spin 1s linear infinite;">autorenew</span><br>Loading Feed...</div>';

    //      
    if (feedUnsub) feedUnsub();
    
    // -  (  )
    feedUnsub = db.collection('posts')
        .orderBy('createdAt', 'desc')
        .limit(20)
        .onSnapshot(snap => {
            if (snap.empty) {
                feedList.innerHTML = '<div class="empty-feed"><span class="material-symbols-outlined">inbox</span><br>No posts yet. Be the first to post!</div>';
                return;
            }

            let html = '';
            snap.forEach(doc => {
                const p = doc.data();
                const pid = doc.id;
                const isLiked = p.likedBy && p.likedBy.includes(currentUser?.uid);
                const likeCount = p.likes || 0;
                const safeName = p.name ? p.name : 'User';
                
                //   
                const avHtml = p.avatar 
                    ? `<img src="${p.avatar}" style="width:42px;height:42px;border-radius:50%;object-fit:cover;">` 
                    : `<div style="width:42px;height:42px;border-radius:50%;background:var(--gradient);display:flex;align-items:center;justify-content:center;font-weight:bold;">${safeName.charAt(0).toUpperCase()}</div>`;

                html += `
                <div style="background:var(--surface); margin:12px 16px; padding:16px; border-radius:20px; border:1px solid var(--border); box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
                    
                    <!-- Post Header (Clickable for Profile) -->
                    <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px; cursor:pointer;">
                        ${avHtml}
                        <div>
                            <div style="font-weight:700; font-size:15px; color:var(--text);">${safeName}</div>
                            <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">Just now</div>
                        </div>
                    </div>
                    
                    <!-- Post Content -->
                    <div style="margin-bottom:16px; line-height:1.5; color:var(--text); font-size:14px; word-break: break-word;">
                        ${p.title}
                    </div>
                    
                    <!-- Post Actions -->
                    <div style="display:flex; gap:20px; border-top:1px solid var(--border); padding-top:12px;">
                        <div onclick="toggleLike('${pid}')" style="cursor:pointer; display:flex; align-items:center; gap:6px; font-weight:600; font-size:14px; transition:0.2s; color:${isLiked ? 'var(--danger)' : 'var(--text-muted)'};">
                            <span class="material-symbols-outlined" style="font-variation-settings:'FILL' ${isLiked ? '1' : '0'}; font-size:20px;">favorite</span> 
                            ${likeCount}
                        </div>
                        <div style="cursor:pointer; display:flex; align-items:center; gap:6px; font-weight:600; font-size:14px; color:var(--text-muted); transition:0.2s;">
                            <span class="material-symbols-outlined" style="font-size:20px;">chat_bubble</span> 
                            Comment
                        </div>
                    </div>
                </div>`;
            });
            feedList.innerHTML = html;
        });
}

//      
async function toggleLike(pid) {
    if (!currentUser) return;
    const ref = db.collection('posts').doc(pid);
    const doc = await ref.get();
    if (!doc.exists) return;

    const p = doc.data();
    let likedBy = p.likedBy || [];
    let likes = p.likes || 0;

    if (likedBy.includes(currentUser.uid)) {
        likedBy = likedBy.filter(id => id !== currentUser.uid); // 
        likes = Math.max(0, likes - 1);
    } else {
        likedBy.push(currentUser.uid); // 
        likes++;
    }
    
    //    -        
    await ref.update({ likes, likedBy });
}

//          
auth.onAuthStateChanged(user => {
    if (user) {
        setTimeout(loadFeed, 1000); 
    }
});
// ==========================================
// 8. COMMENT SYSTEM
// ==========================================
let activeCommentPostId = null;

function openCommentPanel(pid) {
    activeCommentPostId = pid;
    document.getElementById('comment-panel').style.display = 'flex';
    
    // -  
    db.collection('posts').doc(pid).onSnapshot(doc => {
        const list = document.getElementById('comment-list');
        if (!doc.exists) { list.innerHTML = '<div class="empty-feed">Post deleted</div>'; return; }
        
        const comments = doc.data().comments || [];
        if (comments.length === 0) {
            list.innerHTML = '<div class="empty-feed" style="margin-top:20px;">No comments yet. Be the first!</div>';
            return;
        }

        list.innerHTML = comments.map(c => `
            <div class="comment-item">
                <div class="comment-avatar" onclick="viewUserProfile('${c.uid}')" style="cursor:pointer;">
                    ${avatarInitial(c.name)}
                </div>
                <div class="comment-body">
                    <div class="comment-name" onclick="viewUserProfile('${c.uid}')" style="cursor:pointer;">${escapeHTML(c.name)}</div>
                    <div class="comment-text">${escapeHTML(c.text)}</div>
                </div>
            </div>
        `).join('');
    });
}

function closeCommentPanel() {
    document.getElementById('comment-panel').style.display = 'none';
    activeCommentPostId = null;
}

async function submitComment() {
    const input = document.getElementById('comment-input');
    const text = input.value.trim();
    if (!text || !activeCommentPostId || !currentUser) return;
    
    input.value = '';
    const ref = db.collection('posts').doc(activeCommentPostId);
    
    try {
        const doc = await ref.get();
        if (doc.exists) {
            let comments = doc.data().comments || [];
            comments.push({
                uid: currentUser.uid,
                name: currentUserData.name || 'User',
                text: text,
                time: Date.now()
            });
            await ref.update({ comments });
        }
    } catch (e) {
        showToast("Failed to post comment");
    }
}

// ==========================================
// 9. VIEW OTHER USER PROFILE
// ==========================================
let currentOtherProfileUid = null;

async function viewUserProfile(uid) {
    //         
    if (uid === currentUser?.uid) {
        showPage('profile');
        return;
    }
    
    currentOtherProfileUid = uid;
    document.getElementById('other-profile-screen').style.display = 'flex';
    const header = document.getElementById('other-profile-header');
    header.innerHTML = '<div class="loading"><span class="material-symbols-outlined">autorenew</span></div>';

    try {
        const doc = await db.collection('users').doc(uid).get();
        if (!doc.exists) return;
        
        const u = doc.data();
        const safeName = escapeHTML(u.name || 'User');
        const isFollowing = currentUserData?.following?.includes(uid);
        
        const followersCount = (u.followers || []).length;
        const followingCount = (u.following || []).length;
        
        header.innerHTML = `
            <div class="profile-avatar-large">${avatarInitial(u.name)}</div>
            <div class="profile-name">${safeName}</div>
            <div style="font-size:14px; color:var(--text-muted);">${escapeHTML(u.bio || '')}</div>
            
            <div class="profile-stats">
                <div><b>${followersCount}</b> Followers</div>
                <div><b>${followingCount}</b> Following</div>
            </div>
            
            <button class="${isFollowing ? 'btn-unfollow' : 'btn-follow'}" onclick="toggleFollow('${uid}')">
                ${isFollowing ? 'Unfollow' : 'Follow'}
            </button>
            <button class="btn-follow" style="background:var(--surface-2); color:var(--text); border:1px solid var(--border); margin-left:10px;" onclick="closeUserProfile(); openChat('${uid}', '${safeName}')">
    Message
</button>
        `;
        
        loadOtherUserPosts(uid);
    } catch (e) {
        console.error(e);
    }
}

function closeUserProfile() {
    document.getElementById('other-profile-screen').style.display = 'none';
    currentOtherProfileUid = null;
}

async function loadOtherUserPosts(uid) {
    const list = document.getElementById('other-posts-list');
    list.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">Loading posts...</div>';
    
    try {
        const snap = await db.collection('posts').where('uid', '==', uid).get();
        let posts = [];
        snap.forEach(d => { posts.push({id: d.id, ...d.data()}); });
        
        if (posts.length === 0) {
            list.innerHTML = '<div class="empty-feed">No posts yet</div>';
            return;
        }
        
        //   
        posts.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
        
        let html = '<div class="feed-container">';
        posts.forEach(p => {
            const isLiked = p.likedBy && p.likedBy.includes(currentUser?.uid);
            html += `
            <div class="post-card" style="margin-top:0;">
                <div class="post-content">${escapeHTML(p.title || '')}</div>
                <div class="post-actions">
                    <button class="post-action-btn ${isLiked ? 'liked' : ''}" onclick="toggleLike('${p.id}'); viewUserProfile('${uid}');">
                        <span class="material-symbols-outlined">${isLiked ? 'favorite' : 'heart_plus'}</span>
                        <span>${p.likes || 0}</span>
                    </button>
                    <button class="post-action-btn" onclick="openCommentPanel('${p.id}')">
                        <span class="material-symbols-outlined">chat_bubble</span>
                        <span>${(p.comments || []).length}</span>
                    </button>
                </div>
            </div>`;
        });
        html += '</div>';
        list.innerHTML = html;
    } catch (e) {
        list.innerHTML = '<div class="empty-feed">Failed to load posts</div>';
    }
}

// ==========================================
// 10. SEARCH & FOLLOW SYSTEM
// ==========================================
async function searchUsers() {
    const q = document.getElementById('search-input').value.trim().toLowerCase();
    const resultBox = document.getElementById('search-results-list');
    
    if (q.length < 2) {
        resultBox.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-muted);">Type at least 2 characters...</div>';
        return;
    }

    try {
        const snap = await db.collection('users').get();
        let html = '';
        let found = false;

        snap.forEach(doc => {
            if (doc.id === currentUser?.uid) return; //   
            
            const u = doc.data();
            if (u.name && u.name.toLowerCase().includes(q)) {
                found = true;
                const isFollowing = currentUserData?.following?.includes(doc.id);
                
                html += `
                <div style="display:flex; align-items:center; justify-content:space-between; padding:15px; background:var(--surface); border:1px solid var(--border); border-radius:15px; margin:10px 15px;">
                    <div style="display:flex; align-items:center; gap:12px; cursor:pointer; flex:1;" onclick="viewUserProfile('${doc.id}')">
                        <div style="width:40px; height:40px; border-radius:50%; background:var(--gradient); color:white; display:flex; align-items:center; justify-content:center; font-weight:bold;">
                            ${avatarInitial(u.name)}
                        </div>
                        <div style="font-weight:700; color:var(--text);">${escapeHTML(u.name)}</div>
                    </div>
                    <button class="${isFollowing ? 'btn-unfollow' : 'btn-follow'}" style="margin-top:0; padding:8px 16px;" onclick="toggleFollow('${doc.id}'); searchUsers();">
                        ${isFollowing ? 'Unfollow' : 'Follow'}
                    </button>
                </div>`;
            }
        });

        resultBox.innerHTML = found ? html : '<div class="empty-feed">No users found</div>';
    } catch (e) {
        console.error(e);
    }
}

async function toggleFollow(targetUid) {
    if (!currentUser) return;
    
    const isFollowing = currentUserData?.following?.includes(targetUid);
    
    try {
        if (isFollowing) {
            await db.collection('users').doc(currentUser.uid).update({ following: firebase.firestore.FieldValue.arrayRemove(targetUid) });
            await db.collection('users').doc(targetUid).update({ followers: firebase.firestore.FieldValue.arrayRemove(currentUser.uid) });
            showToast('Unfollowed');
        } else {
            await db.collection('users').doc(currentUser.uid).update({ following: firebase.firestore.FieldValue.arrayUnion(targetUid) });
            await db.collection('users').doc(targetUid).update({ followers: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) });
            showToast('Following!');
        }
        
        //       
        const snap = await db.collection('users').doc(currentUser.uid).get();
        currentUserData = snap.data();
        
        //         -
        if (currentOtherProfileUid === targetUid) {
            viewUserProfile(targetUid);
        }
    } catch (e) {
        showToast("Error updating follow status");
    }
}
// ==========================================
// 11. MY PROFILE SETUP
// ==========================================
//   My Profile   
function loadMyProfile() {
    if (!currentUser || !currentUserData) return;
    
    const safeName = escapeHTML(currentUserData.name || 'User');
    const followersCount = (currentUserData.followers || []).length;
    const followingCount = (currentUserData.following || []).length;
    
        document.getElementById('my-profile-header').innerHTML = `
        <div class="profile-avatar-large">${currentUserData.avatar ? `<img src="${currentUserData.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : avatarInitial(currentUserData.name)}</div>
        <div class="profile-name">${safeName}</div>
        <div style="font-size:14px; color:var(--text-muted); margin-bottom:15px;">${escapeHTML(currentUserData.bio || 'Welcome to my GoChat profile!')}</div>
        
        <div class="profile-stats">
            <div><b>${followersCount}</b> Followers</div>
            <div><b>${followingCount}</b> Following</div>
        </div>
        
        <div style="display:flex; justify-content:center; gap:10px; margin-top:15px;">
            <button class="btn-follow" style="width:auto; border-radius:30px;" onclick="openEditProfile()">
                <span class="material-symbols-outlined" style="vertical-align:middle; font-size:18px;">edit</span> Edit Profile
            </button>
            <button class="btn-unfollow" style="width:auto; border-color:var(--danger); color:var(--danger); border-radius:30px;" onclick="doLogout()">
                <span class="material-symbols-outlined" style="vertical-align:middle; font-size:18px;">logout</span>
            </button>
        </div>
    `;
    
    //     
    loadOtherUserPosts(currentUser.uid);
}

// ==========================================
// 12. REAL-TIME CHAT SYSTEM
// ==========================================
let chatUnsub = null;

function openChat(otherUid, otherName) {
    //     (       )
    currentChatId = [currentUser.uid, otherUid].sort().join('_');
    currentChatOtherUid = otherUid;
    
    document.getElementById('chat-name-display').textContent = escapeHTML(otherName);
    document.getElementById('chat-screen').style.display = 'flex';
    
    const list = document.getElementById('chat-messages');
    list.innerHTML = '<div class="loading" style="text-align:center; padding:20px; color:var(--text-muted);"><span class="material-symbols-outlined" style="animation:spin 1s linear infinite;">autorenew</span></div>';

    //    
    if (chatUnsub) chatUnsub();
    
    // -  
    chatUnsub = db.collection('chats').doc(currentChatId).collection('messages')
        .orderBy('createdAt')
        .onSnapshot(snap => {
            let html = '';
            snap.forEach(doc => {
                const m = doc.data();
                const isMine = m.uid === currentUser.uid;
                
                //   
                let timeString = '';
                if (m.createdAt) {
                    const date = m.createdAt.toDate ? m.createdAt.toDate() : new Date(m.createdAt);
                    timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                }

                html += `
                <div class="chat-bubble ${isMine ? 'mine' : 'theirs'}">
                    ${escapeHTML(m.text)}
                    <span class="chat-time">${timeString}</span>
                </div>`;
            });
            list.innerHTML = html || '<div style="text-align:center; padding:30px; color:var(--text-muted);">Send a message to start chatting!</div>';
            
            //      
            list.scrollTop = list.scrollHeight;
        });
}

function closeChat() {
    document.getElementById('chat-screen').style.display = 'none';
    if (chatUnsub) chatUnsub();
    currentChatId = null;
    currentChatOtherUid = null;
}

async function sendMsg() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    
    if (!text || !currentChatId || !currentUser) return;
    input.value = ''; //      
    
    try {
        // .  -  
        await db.collection('chats').doc(currentChatId).collection('messages').add({
            uid: currentUser.uid,
            text: text,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // .     (  )
        await db.collection('chats').doc(currentChatId).set({
            lastMsg: text,
            lastAt: firebase.firestore.FieldValue.serverTimestamp(),
            participants: [currentUser.uid, currentChatOtherUid]
        }, { merge: true });
        
    } catch (e) {
        showToast("Failed to send message.");
    }
}

//         
const originalShowPage = showPage;
showPage = function(pageId) {
    originalShowPage(pageId);
    if (pageId === 'profile') {
        loadMyProfile();
    }
};
// ==========================================
// 13. INBOX (MESSAGE LIST) SYSTEM
// ==========================================
let chatListUnsub = null;

function loadMessageList() {
    const list = document.getElementById('msg-list');
    if (!list || !currentUser) return;

    list.innerHTML = '<div class="loading" style="text-align:center; padding:30px;"><span class="material-symbols-outlined" style="animation:spin 1s linear infinite;">autorenew</span></div>';

    if (chatListUnsub) chatListUnsub();

    //     ,    
    chatListUnsub = db.collection('chats')
        .where('participants', 'array-contains', currentUser.uid)
        .orderBy('lastAt', 'desc')
        .onSnapshot(async snap => {
            if (snap.empty) {
                list.innerHTML = '<div class="empty-feed"><span class="material-symbols-outlined">chat_bubble</span><br>No conversations yet.</div>';
                return;
            }

            let html = '';
            for (let d of snap.docs) {
                const chat = d.data();
                //     
                const otherUid = chat.participants.find(id => id !== currentUser.uid);
                
                //         (Cache    ,     )
                try {
                    const uDoc = await db.collection('users').doc(otherUid).get();
                    if (uDoc.exists) {
                        const uData = uDoc.data();
                        const safeName = escapeHTML(uData.name || 'User');
                        const avHtml = uData.avatar 
                            ? `<img src="${escapeHTML(uData.avatar)}" class="post-avatar">` 
                            : `<div class="post-avatar">${avatarInitial(uData.name)}</div>`;
                        
                        html += `
                        <div class="inbox-item" onclick="openChat('${otherUid}', '${safeName}')">
                            ${avHtml}
                            <div class="inbox-info">
                                <div class="inbox-name">${safeName}</div>
                                <div class="inbox-msg">${escapeHTML(chat.lastMsg || 'Sent a message')}</div>
                            </div>
                        </div>`;
                    }
                } catch (e) {
                    console.error("Error fetching chat user", e);
                }
            }
            list.innerHTML = html;
        });
}

// ==========================================
// 14. NOTIFICATIONS SYSTEM
// ==========================================
let notifUnsub = null;

function loadNotifications() {
    const list = document.getElementById('notifications-list');
    const badge = document.getElementById('notif-badge');
    if (!list || !currentUser) return;

    list.innerHTML = '<div class="loading" style="text-align:center; padding:30px;"><span class="material-symbols-outlined" style="animation:spin 1s linear infinite;">autorenew</span></div>';

    if (notifUnsub) notifUnsub();

    notifUnsub = db.collection('notifications')
        .where('toUid', '==', currentUser.uid)
        .orderBy('createdAt', 'desc')
        .limit(30) //    
        .onSnapshot(snap => {
            if (snap.empty) {
                list.innerHTML = '<div class="empty-feed"><span class="material-symbols-outlined">notifications</span><br>No notifications yet.</div>';
                if (badge) badge.style.display = 'none';
                return;
            }

            let html = '';
            let unreadCount = 0;

            snap.forEach(d => {
                const n = d.data();
                if (!n.read) unreadCount++;

                let textDesc = 'interacted with you';
                let icon = 'notifications';
                let color = 'var(--text)';

                //        
                if (n.type === 'like') { textDesc = 'liked your post'; icon = 'favorite'; color = 'var(--danger)'; }
                else if (n.type === 'comment') { textDesc = 'commented on your post'; icon = 'chat_bubble'; color = 'var(--accent)'; }
                else if (n.type === 'follow') { textDesc = 'started following you'; icon = 'person_add'; color = 'var(--warning)'; }

                html += `
                <div class="inbox-item" style="background:${n.read ? 'var(--surface)' : 'var(--surface-2)'}; cursor:default;">
                    <div class="notif-icon" style="color:${color};">
                        <span class="material-symbols-outlined" style="font-variation-settings:'FILL' 1;">${icon}</span>
                    </div>
                    <div class="inbox-info">
                        <div class="notif-text"><b>${escapeHTML(n.fromName || 'Someone')}</b> ${textDesc}</div>
                        <div class="inbox-msg" style="margin-top:4px;">${getRelativeTime(n.createdAt)}</div>
                    </div>
                </div>`;
                
                //    read   
                if (!n.read) {
                    d.ref.update({ read: true }).catch(() => {});
                }
            });

            list.innerHTML = html;

            //    (           )
            if (badge) {
                badge.textContent = unreadCount;
                badge.style.display = unreadCount > 0 ? 'flex' : 'none';
            }
        });
}

// ==========================================
// 15. NAVIGATION UPDATE
// ==========================================
//   showPage    (Override) ,       
const originalShowPageV2 = showPage;
showPage = function(pageId) {
    originalShowPageV2(pageId);
    if (pageId === 'messages') {
        loadMessageList();
    } else if (pageId === 'notifications') {
        loadNotifications();
    }
};
// ==========================================
// 16. IMAGE UPLOAD & STORY SYSTEM
// ==========================================
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

//     
async function uploadToCloudinary(file, isVideo = false) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', 'gochat');
    
    const endpoint = isVideo 
        ? 'https://api.cloudinary.com/v1_1/dsnqmwyvt/video/upload' 
        : 'https://api.cloudinary.com/v1_1/dsnqmwyvt/image/upload';
        
    const res = await fetch(endpoint, { method: 'POST', body: formData });
    const data = await res.json();
    if (data.secure_url) return data.secure_url;
    throw new Error('Upload failed');
}

//  
async function uploadStory(input) {
    const file = input.files[0];
    if (!file || !currentUser) return;
    
    const isVideo = file.type.startsWith('video/');
    showToast('Uploading Story...');
    
    try {
        const url = await uploadToCloudinary(file, isVideo);
        await db.collection('stories').add({
            uid: currentUser.uid,
            name: currentUserData.name,
            avatar: currentUserData.avatar || '',
            mediaUrl: url,
            isVideo: isVideo,
            views: [],
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            expiresAt: new Date(Date.now() + ONE_DAY_MS)
        });
        showToast('Story added!');
        input.value = ''; //  
    } catch(e) {
        showToast('Failed to upload story.');
    }
}

//    (-)
let storyUnsub = null;
window.allStoriesData = [];

function loadStories() {
    const list = document.getElementById('stories-list');
    if (!list || !currentUser) return;

    if (storyUnsub) storyUnsub();
    
    storyUnsub = db.collection('stories').onSnapshot(snap => {
        let stories = [];
        snap.forEach(d => stories.push({ id: d.id, ...d.data() }));
        
        let grouped = {};
        stories.forEach(s => {
            if (!grouped[s.uid]) grouped[s.uid] = [];
            grouped[s.uid].push(s);
        });
        
        let html = '';
        
        // .      ( )
        const myAv = currentUserData?.avatar 
            ? `<img src="${currentUserData.avatar}">` 
            : `<div style="width:100%;height:100%;border-radius:50%;background:var(--bg);display:flex;align-items:center;justify-content:center;font-weight:bold;color:white;">${avatarInitial(currentUserData?.name)}</div>`;
            
        html += `
        <div class="story-item-wrap">
            <label class="story-circle" style="background:var(--surface-2); border:1px solid var(--border);">
                ${myAv}
                <div class="story-add-btn"><span class="material-symbols-outlined" style="font-size:16px;">add</span></div>
                <input type="file" accept="image/*,video/*" style="display:none;" onchange="uploadStory(this)">
            </label>
            <div class="story-name">Add Story</div>
        </div>`;

        // .    
        for (let uid in grouped) {
            //       (    ,  )
            if (uid === currentUser.uid) continue;
            
            const userStories = grouped[uid];
            //            
            const allSeen = userStories.every(s => s.views && s.views.includes(currentUser.uid));
            
            const uName = userStories[0].name;
            const uAv = userStories[0].avatar ? `<img src="${userStories[0].avatar}">` : `<div style="width:100%;height:100%;border-radius:50%;background:var(--bg);display:flex;align-items:center;justify-content:center;color:white;">${avatarInitial(uName)}</div>`;
            
            html += `
            <div class="story-item-wrap" onclick="playStories('${uid}')">
                <div class="story-circle ${allSeen ? 'seen' : ''}">
                    ${uAv}
                </div>
                <div class="story-name" style="color:${allSeen ? 'var(--text-muted)' : 'var(--text)'};">${escapeHTML(uName)}</div>
            </div>`;
        }
        
        list.innerHTML = html;
        window.allStoriesData = stories;
    });
}

//  
let activeStoryGroup = [];
let currentStoryIndex = 0;
let storyTimer = null;

function playStories(uid) {
    activeStoryGroup = window.allStoriesData.filter(s => s.uid === uid).sort((a,b) => {
        const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return ta - tb;
    });
    
    if (activeStoryGroup.length === 0) return;
    currentStoryIndex = 0;
    document.getElementById('story-viewer').style.display = 'flex';
    renderCurrentStory();
}

function renderCurrentStory() {
    if (currentStoryIndex >= activeStoryGroup.length) {
        closeStory();
        return;
    }
    
    const s = activeStoryGroup[currentStoryIndex];
    document.getElementById('sv-name').textContent = escapeHTML(s.name);
    document.getElementById('sv-avatar').innerHTML = s.avatar ? `<img src="${s.avatar}" style="width:100%;height:100%;object-fit:cover;">` : `<div style="width:100%;height:100%;background:var(--bg);color:white;display:flex;align-items:center;justify-content:center;">${avatarInitial(s.name)}</div>`;
    
    const mediaCont = document.getElementById('sv-media-container');
    if (s.isVideo) {
        mediaCont.innerHTML = `<video src="${s.mediaUrl}" autoplay playsinline onended="nextStorySegment()" style="width:100%;max-height:100vh;object-fit:contain;"></video>`;
        clearTimeout(storyTimer);
    } else {
        mediaCont.innerHTML = `<img src="${s.mediaUrl}" style="width:100%;max-height:100vh;object-fit:contain;">`;
        clearTimeout(storyTimer);
        storyTimer = setTimeout(nextStorySegment, 5000);
    }
    
    //  
    document.getElementById('story-progress-bar').innerHTML = activeStoryGroup.map((_, i) => `
        <div class="story-progress-segment">
            <div class="story-progress-fill ${i === currentStoryIndex ? 'animating' : ''}" style="width:${i < currentStoryIndex ? '100%' : '0%'};"></div>
        </div>
    `).join('');
    
    //  
    if (s.uid !== currentUser.uid && !(s.views || []).includes(currentUser.uid)) {
        db.collection('stories').doc(s.id).update({
            views: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
        });
    }
}

function nextStorySegment() {
    currentStoryIndex++;
    renderCurrentStory();
}

function closeStory() {
    document.getElementById('story-viewer').style.display = 'none';
    clearTimeout(storyTimer);
    document.getElementById('sv-media-container').innerHTML = '';
}

//      
const origShowPageForStory = showPage;
showPage = function(pageId) {
    origShowPageForStory(pageId);
    if (pageId === 'feed') {
        loadStories();
    }
};
// ==========================================
// 17. EDIT PROFILE SYSTEM
// ==========================================
let newAvatarFile = null;

function openEditProfile() {
    if (!currentUser || !currentUserData) return;
    
    document.getElementById('edit-name-input').value = currentUserData.name || '';
    document.getElementById('edit-bio-input').value = currentUserData.bio || '';
    
    const preview = document.getElementById('edit-avatar-preview');
    if (currentUserData.avatar) {
        preview.innerHTML = `<img src="${currentUserData.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
    } else {
        preview.innerHTML = `<span class="material-symbols-outlined" style="font-size:30px; color:var(--text-muted);">add_a_photo</span>`;
    }
    
    newAvatarFile = null;
    document.getElementById('edit-profile-modal').style.display = 'flex';
}

function closeEditProfile() {
    document.getElementById('edit-profile-modal').style.display = 'none';
    document.getElementById('edit-avatar-input').value = '';
}

function previewAvatar(input) {
    if (input.files && input.files[0]) {
        newAvatarFile = input.files[0];
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('edit-avatar-preview').innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
        }
        reader.readAsDataURL(newAvatarFile);
    }
}

async function saveProfile() {
    const newName = document.getElementById('edit-name-input').value.trim();
    const newBio = document.getElementById('edit-bio-input').value.trim();
    
    if (!newName) {
        showToast("Name cannot be empty");
        return;
    }
    
    showToast("Saving profile...");
    let updatedData = { name: newName, bio: newBio };
    
    try {
        //      ,    
        if (newAvatarFile) {
            const avatarUrl = await uploadToCloudinary(newAvatarFile, false);
            updatedData.avatar = avatarUrl;
        }
        
        //   
        await db.collection('users').doc(currentUser.uid).update(updatedData);
        
        //   
        currentUserData = { ...currentUserData, ...updatedData };
        
        showToast("Profile updated!");
        closeEditProfile();
        loadMyProfile(); //   
        
    } catch (e) {
        showToast("Error updating profile");
        console.error(e);
    }
}

//  
function doLogout() {
    auth.signOut().then(() => {
        showToast("Logged out successfully");
    });
}
