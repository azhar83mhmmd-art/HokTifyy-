/**
 * HokTify V3 — Premium Vanilla JS
 * Upgraded: IndexedDB Playlist · Playlist Detail Page · Mini Player Bottom
 * Smart Lyrics · YouTube IFrame · LRCLIB · Offline Cache · Modern Nav
 */

/* ═══════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════ */
const PH = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3Crect fill='%231a1a2e'/%3E%3C/svg%3E`
const PLAY_IC  = `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg>`
const PAUSE_IC = `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`
const HEART_IC = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`
const MORE_IC  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="19" r="1" fill="currentColor"/></svg>`

/* ═══════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════ */
const $ = id => document.getElementById(id)
const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
const fmt = s => { if(!s||isNaN(s)) return '0:00'; const n=Math.round(s); return `${Math.floor(n/60)}:${(n%60).toString().padStart(2,'0')}` }
const debounce = (fn,ms) => { let t; return (...a) => { clearTimeout(t); t=setTimeout(()=>fn(...a),ms) } }
const ric = fn => window.requestIdleCallback ? requestIdleCallback(fn,{timeout:2000}) : setTimeout(fn,50)

const AC = {}
function mkAC(k) { try{AC[k]?.abort()}catch{}; AC[k]=new AbortController(); return AC[k] }

/* ═══════════════════════════════════════════════
   SMART QUERY CLASSIFIER
   ═══════════════════════════════════════════════ */
const SmartQuery = {
  normalize(q) { return q.toLowerCase().replace(/[^\w\s]/g,' ').replace(/\s+/g,' ').trim() },
  isLyric(q) {
    const norm = this.normalize(q)
    const words = norm.split(' ').filter(w=>w.length>1)
    if (words.length >= 5) return true
    if (words.length < 2) return false
    const markers = ['i ','you ','me ','my ','your ','we ','love ','heart ','feel ','know ',
                     'want ','need ','baby ','never ','always ','yeah ','oh ','gonna ',
                     "don't",'cant ','when ','and i','but i','cause ','all the ']
    return markers.some(m => norm.includes(m))
  },
  levenshtein(a, b) {
    if (Math.abs(a.length-b.length) > 4) return 99
    const m=a.length,n=b.length,dp=Array.from({length:m+1},(_,i)=>[i,...Array(n).fill(0)])
    for(let j=0;j<=n;j++) dp[0][j]=j
    for(let i=1;i<=m;i++) for(let j=1;j<=n;j++)
      dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1])
    return dp[m][n]
  },
  similarity(a,b) {
    const na=this.normalize(a),nb=this.normalize(b)
    if(na===nb) return 1
    if(na.includes(nb)||nb.includes(na)) return 0.9
    const wa=na.split(' '),wb=nb.split(' ')
    let matched=0
    for(const w of wa){ if(wb.some(x=>x===w||(w.length>3&&this.levenshtein(w,x)<=1))) matched++ }
    return matched/Math.max(wa.length,wb.length)
  }
}

/* ═══════════════════════════════════════════════
   STORE — localStorage (with IndexedDB for playlists)
   ═══════════════════════════════════════════════ */
const Store = {
  get(k,d=null){ try{const v=localStorage.getItem('sw3_'+k);return v?JSON.parse(v):d}catch{return d} },
  set(k,v){ try{localStorage.setItem('sw3_'+k,JSON.stringify(v))}catch{} },
  rm(k){ try{localStorage.removeItem('sw3_'+k)}catch{} },

  /* Migrate old keys from sw2_ prefix */
  migrate(){
    const keys=['liked','history','playlists','search_hist']
    keys.forEach(k=>{
      try{
        const old=localStorage.getItem('sw2_'+k)
        if(old && !localStorage.getItem('sw3_'+k)){
          localStorage.setItem('sw3_'+k,old)
        }
      }catch{}
    })
  }
}

/* ═══════════════════════════════════════════════
   IDB — IndexedDB Playlist Store (permanent backup)
   ═══════════════════════════════════════════════ */
const IDB = {
  _db: null,

  async open(){
    if(this._db) return this._db
    return new Promise((res,rej)=>{
      const req=indexedDB.open('hoktify_v3',2)
      req.onupgradeneeded=e=>{
        const db=e.target.result
        if(!db.objectStoreNames.contains('playlists'))
          db.createObjectStore('playlists',{keyPath:'id'})
        if(!db.objectStoreNames.contains('cache'))
          db.createObjectStore('cache',{keyPath:'key'})
      }
      req.onsuccess=e=>{ this._db=e.target.result; res(this._db) }
      req.onerror=()=>rej(req.error)
    })
  },

  async getPlaylists(){
    try{
      const db=await this.open()
      return new Promise((res,rej)=>{
        const tx=db.transaction('playlists','readonly')
        const req=tx.objectStore('playlists').getAll()
        req.onsuccess=()=>res(req.result||[])
        req.onerror=()=>res([])
      })
    }catch{ return [] }
  },

  async savePlaylist(pl){
    try{
      const db=await this.open()
      return new Promise((res)=>{
        const tx=db.transaction('playlists','readwrite')
        tx.objectStore('playlists').put(pl)
        tx.oncomplete=()=>res(true)
        tx.onerror=()=>res(false)
      })
    }catch{ return false }
  },

  async deletePlaylist(id){
    try{
      const db=await this.open()
      return new Promise((res)=>{
        const tx=db.transaction('playlists','readwrite')
        tx.objectStore('playlists').delete(id)
        tx.oncomplete=()=>res(true)
        tx.onerror=()=>res(false)
      })
    }catch{ return false }
  },

  async syncFromLS(){
    const lsPl=Store.get('playlists',[])
    for(const pl of lsPl){ await this.savePlaylist(pl) }
  },

  async syncToLS(){
    const idbPl=await this.getPlaylists()
    if(idbPl.length>0) Store.set('playlists',idbPl)
  }
}

/* ═══════════════════════════════════════════════
/* ═══════════════════════════════════════════════
   OFFLINE CACHE — Cache song metadata & thumbnails for offline use
   ═══════════════════════════════════════════════ */
const OfflineCache = {
  _db: null,
  STORE: 'offline_songs',
  THUMB_STORE: 'offline_thumbs',

  async open(){
    if(this._db) return this._db
    return new Promise((res,rej)=>{
      const req = indexedDB.open('hoktify_offline_v1', 1)
      req.onupgradeneeded = e => {
        const db = e.target.result
        if(!db.objectStoreNames.contains(this.STORE))
          db.createObjectStore(this.STORE, {keyPath:'id'})
        if(!db.objectStoreNames.contains(this.THUMB_STORE))
          db.createObjectStore(this.THUMB_STORE, {keyPath:'id'})
      }
      req.onsuccess = e => { this._db = e.target.result; res(this._db) }
      req.onerror = () => rej(req.error)
    })
  },

  async cacheSong(song){
    try {
      const db = await this.open()
      await new Promise((res,rej)=>{
        const tx = db.transaction(this.STORE,'readwrite')
        tx.objectStore(this.STORE).put({...song, cachedAt: Date.now()})
        tx.oncomplete = ()=>res(true)
        tx.onerror = ()=>rej(tx.error)
      })
      if(song.thumbnail){
        try {
          const resp = await fetch(song.thumbnail, {mode:'cors'})
          if(resp.ok){
            const blob = await resp.blob()
            const reader = new FileReader()
            const dataUrl = await new Promise(r=>{ reader.onload=()=>r(reader.result); reader.readAsDataURL(blob) })
            await new Promise((res2)=>{
              const tx2 = db.transaction(this.THUMB_STORE,'readwrite')
              tx2.objectStore(this.THUMB_STORE).put({id:song.id, dataUrl, cachedAt:Date.now()})
              tx2.oncomplete=()=>res2(true)
              tx2.onerror=()=>res2(false)
            })
          }
        } catch { /* thumbnail cache fail is ok */ }
      }
      return true
    } catch(e){ console.warn('[OfflineCache] cache error',e); return false }
  },

  async getCachedSong(id){
    try {
      const db = await this.open()
      return new Promise((res)=>{
        const tx = db.transaction(this.STORE,'readonly')
        const req = tx.objectStore(this.STORE).get(id)
        req.onsuccess = () => res(req.result||null)
        req.onerror = () => res(null)
      })
    } catch{ return null }
  },

  async getCachedThumb(id){
    try {
      const db = await this.open()
      return new Promise((res)=>{
        const tx = db.transaction(this.THUMB_STORE,'readonly')
        const req = tx.objectStore(this.THUMB_STORE).get(id)
        req.onsuccess = () => res(req.result?.dataUrl||null)
        req.onerror = () => res(null)
      })
    } catch{ return null }
  },

  async getAllCached(){
    try {
      const db = await this.open()
      return new Promise((res)=>{
        const tx = db.transaction(this.STORE,'readonly')
        const req = tx.objectStore(this.STORE).getAll()
        req.onsuccess = () => res(req.result||[])
        req.onerror = () => res([])
      })
    } catch{ return [] }
  },

  async isCached(id){
    const s = await this.getCachedSong(id)
    return !!s
  },

  async removeCached(id){
    try {
      const db = await this.open()
      await new Promise(res=>{
        const tx=db.transaction(this.STORE,'readwrite')
        tx.objectStore(this.STORE).delete(id)
        tx.oncomplete=()=>res()
      })
      await new Promise(res=>{
        const tx=db.transaction(this.THUMB_STORE,'readwrite')
        tx.objectStore(this.THUMB_STORE).delete(id)
        tx.oncomplete=()=>res()
      })
      return true
    } catch{ return false }
  },

  async cachePlaylist(pl, onProgress){
    const songs = pl.songs || []
    let done = 0
    for(const song of songs){
      const already = await this.isCached(song.id)
      if(!already){ await this.cacheSong(song) }
      done++
      onProgress?.(done, songs.length)
    }
    return done
  },

  async isPlaylistCached(pl){
    const songs = pl.songs || []
    if(!songs.length) return false
    for(const s of songs){ if(!(await this.isCached(s.id))) return false }
    return true
  },

  async getCachedCount(pl){
    const songs = pl.songs || []
    let count = 0
    for(const s of songs){ if(await this.isCached(s.id)) count++ }
    return count
  }
}

/* ═══════════════════════════════════════════════
   PLAYLIST STORE — unified access layer
   ═══════════════════════════════════════════════ */
const PlStore = {
  _cache: null,

  async getAll(){
    if(this._cache) return this._cache
    // Try IDB first, fall back to localStorage
    let pls = await IDB.getPlaylists()
    if(!pls.length) {
      pls = Store.get('playlists',[])
      // Migrate to IDB
      for(const pl of pls) await IDB.savePlaylist(pl)
    }
    this._cache = pls
    return pls
  },

  async save(pl){
    this._cache = null
    const all = await this.getAll()
    const idx = all.findIndex(p=>p.id===pl.id)
    if(idx>=0) all[idx]=pl; else all.unshift(pl)
    this._cache = all
    Store.set('playlists', all)
    await IDB.savePlaylist(pl)
    return all
  },

  async delete(id){
    this._cache = null
    const all = (await this.getAll()).filter(p=>p.id!==id)
    this._cache = all
    Store.set('playlists', all)
    await IDB.deletePlaylist(id)
    return all
  },

  invalidate(){ this._cache = null }
}

/* ═══════════════════════════════════════════════
   TOAST
   ═══════════════════════════════════════════════ */
const Toast = {
  _n:0,
  show(msg,type='info',dur=2600){
    if(this._n>3) return; this._n++
    const icons={
      success:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
      error:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
      info:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
      warning:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
    }
    const el=document.createElement('div')
    el.className=`toast toast-${type}`
    el.innerHTML=`${icons[type]||icons.info}<span>${msg}</span>`
    $('toast-root').appendChild(el)
    setTimeout(()=>{ el.classList.add('tout'); setTimeout(()=>{el.remove();this._n--},260) },dur)
  }
}

/* ═══════════════════════════════════════════════
   LAZY IMAGE
   ═══════════════════════════════════════════════ */
const Lazy = (() => {
  const io = new IntersectionObserver(entries=>{
    entries.forEach(e=>{
      if(!e.isIntersecting) return
      const img=e.target, src=img.dataset.src
      if(!src) return
      img.src=src
      img.onload=()=>img.classList.add('loaded')
      img.onerror=()=>{img.src=PH;img.classList.add('loaded')}
      io.unobserve(img)
    })
  },{rootMargin:'140px 0px',threshold:0.01})
  return { obs:img=>{ if(!img?.dataset?.src) return; if(img.complete&&img.naturalWidth){img.classList.add('loaded');return}; io.observe(img) } }
})()

/* ═══════════════════════════════════════════════
   ROUTER
   ═══════════════════════════════════════════════ */
const Router = {
  cur:'home',
  _history: [],

  go(pg, data=null){
    if(pg===this.cur && pg!=='playlist') return
    this._history.push(this.cur)
    document.querySelectorAll('.pg').forEach(p=>p.classList.remove('active'))
    document.querySelectorAll('.nb').forEach(b=>b.classList.toggle('active',b.dataset.pg===pg))
    const el=document.getElementById('pg-'+pg)
    if(el){ el.classList.add('active'); el.scrollTop=0 }
    this.cur=pg
    if(pg==='library') LibCtrl.render()
    if(pg==='search') { setTimeout(()=>$('search-input')?.focus(),200) }
    if(pg==='playlist' && data) PlaylistDetail.open(data)
  },

  back(){
    const prev=this._history.pop()||'home'
    document.querySelectorAll('.pg').forEach(p=>p.classList.remove('active'))
    document.querySelectorAll('.nb').forEach(b=>b.classList.toggle('active',b.dataset.pg===prev))
    document.getElementById('pg-'+prev)?.classList.add('active')
    this.cur=prev
    if(prev==='library') LibCtrl.render()
  },

  init(){
    document.querySelectorAll('.nb').forEach(b=>b.addEventListener('click',()=>this.go(b.dataset.pg),{passive:true}))
    document.querySelector('.nb[data-pg="home"]')?.classList.add('active')
    $('pld-back')?.addEventListener('click',()=>this.back())
  }
}

/* ═══════════════════════════════════════════════
   YOUTUBE IFRAME PLAYER
   ═══════════════════════════════════════════════ */
const YTPlayer = {
  player:null, ready:false, pendingId:null, _pollTimer:null,

  init(){
    if(window.YT?.Player){ this._create(); return }
    const tag=document.createElement('script')
    tag.src='https://www.youtube.com/iframe_api'
    document.head.appendChild(tag)
    window.onYouTubeIframeAPIReady=()=>this._create()
  },

  _create(){
    this.player=new YT.Player('yt-player',{
      height:'1',width:'1',
      playerVars:{autoplay:1,controls:0,disablekb:1,fs:0,iv_load_policy:3,modestbranding:1,rel:0,playsinline:1},
      events:{
        onReady:()=>{ this.ready=true; if(this.pendingId){this.loadVideo(this.pendingId);this.pendingId=null} },
        onStateChange:e=>this._onState(e),
        onError:e=>this._onError(e)
      }
    })
  },

  loadVideo(videoId){
    if(!this.ready){this.pendingId=videoId;return}
    this.player.loadVideoById(videoId)
    clearInterval(this._pollTimer)
    this._pollTimer=setInterval(()=>PlayerCtrl._onYTProgress(),400)
  },

  play(){ if(this.ready) this.player.playVideo() },
  pause(){ if(this.ready) this.player.pauseVideo() },
  seek(pct){ if(!this.ready) return; const d=this.getDuration(); if(d>0) this.player.seekTo(d*(pct/100),true) },
  getDuration(){ try{return this.player?.getDuration()||0}catch{return 0} },
  getCurrentTime(){ try{return this.player?.getCurrentTime()||0}catch{return 0} },
  getState(){ try{return this.player?.getPlayerState()??-1}catch{return -1} },

  _onState(e){
    const S=YT.PlayerState
    if(e.data===S.PLAYING){ PlayerCtrl._setPlay(true); PlayerCtrl._setLoad(false) }
    else if(e.data===S.PAUSED){ PlayerCtrl._setPlay(false) }
    else if(e.data===S.BUFFERING){ PlayerCtrl._setLoad(true) }
    else if(e.data===S.ENDED){ PlayerCtrl._onEnded() }
  },
  _onError(e){
    console.warn('[YT Error]',e.data)
    PlayerCtrl._setLoad(false)
    Toast.show('Gagal memutar. Coba lagu lain.','error')
  }
}

/* ═══════════════════════════════════════════════
   MEDIA SESSION API
   ═══════════════════════════════════════════════ */
function setMediaSession(song) {
  if (!('mediaSession' in navigator)) return
  navigator.mediaSession.metadata = new MediaMetadata({
    title:  song.title  || 'HokTify',
    artist: song.artist || '',
    album:  song.album  || '',
    artwork:[{src:song.thumbnail||PH, sizes:'226x226', type:'image/jpeg'}]
  })
  navigator.mediaSession.setActionHandler('play',    ()=>YTPlayer.play())
  navigator.mediaSession.setActionHandler('pause',   ()=>YTPlayer.pause())
  navigator.mediaSession.setActionHandler('nexttrack',     ()=>PlayerCtrl.next())
  navigator.mediaSession.setActionHandler('previoustrack', ()=>PlayerCtrl.prev())
}

/* ═══════════════════════════════════════════════
   PLAYER CONTROLLER
   ═══════════════════════════════════════════════ */
const PlayerCtrl = {
  current:null, queue:[], idx:0, shuffle:false, repeat:false,

  init(){
    this._bindControls()
    this._bindFP()
    this._restore()
    YTPlayer.init()
  },

  _bindControls(){
    $('mp-pp').addEventListener('click',e=>{e.stopPropagation();this.toggle()})
    $('mp-next').addEventListener('click',e=>{e.stopPropagation();this.next()})
    $('fpc-play').addEventListener('click',()=>this.toggle())
    $('fpc-prev').addEventListener('click',()=>this.prev())
    $('fpc-next').addEventListener('click',()=>this.next())
    $('fpc-shuffle').addEventListener('click',()=>this.toggleShuffle())
    $('fpc-repeat').addEventListener('click',()=>this.toggleRepeat())
    $('fp-like').addEventListener('click',()=>this.toggleLike())
    $('hero-like').addEventListener('click',()=>this.toggleLike())
    const seek=$('fp-seek')
    seek.addEventListener('input',()=>{
      seek.style.setProperty('--pct',seek.value+'%')
      YTPlayer.seek(parseFloat(seek.value))
    })
    $('fp-detail-open').addEventListener('click',()=>{ if(this.current) DetailSheet.open(this.current) })
    $('fpc-artist-btn')?.addEventListener('click',()=>{ FP.hide(); if(this.current) DetailSheet.open(this.current,'artist') })
    $('fpc-lyrics-btn')?.addEventListener('click',()=>{ FP.hide(); if(this.current) DetailSheet.open(this.current,'lyrics') })
  },

  _bindFP(){
    $('fp-down').addEventListener('click',()=>FP.hide())
    $('mp-open').addEventListener('click',e=>{
      if(e.target.closest('.mp-btn')||e.target.closest('#mp-loader')) return
      FP.show()
    })
  },

  play(song, queue=null){
    if(!song) return
    if(queue){ this.queue=[...queue]; this.idx=queue.findIndex(s=>s.id===song.id); if(this.idx<0)this.idx=0 }
    else if(!this.queue.length){ this.queue=[song]; this.idx=0 }
    this.current=song
    this._updateUI(song)
    this._setLoad(true)
    YTPlayer.loadVideo(song.id)
    setMediaSession(song)
    ric(()=>this._saveHist(song))
    // Auto-cache song metadata for offline access
    ric(()=>OfflineCache.cacheSong(song).catch(()=>{}))
  },

  toggle(){
    if(!this.current) return
    YTPlayer.getState()===1 ? YTPlayer.pause() : YTPlayer.play()
  },

  next(){
    if(!this.queue.length) return
    if(this.shuffle){
      let ni=Math.floor(Math.random()*this.queue.length)
      if(ni===this.idx&&this.queue.length>1) ni=(ni+1)%this.queue.length
      this.idx=ni
    } else { this.idx=(this.idx+1)%this.queue.length }
    this.play(this.queue[this.idx])
  },

  prev(){
    if(!this.queue.length) return
    if(YTPlayer.getCurrentTime()>3){ YTPlayer.seek(0); return }
    this.idx=(this.idx-1+this.queue.length)%this.queue.length
    this.play(this.queue[this.idx])
  },

  toggleShuffle(){
    this.shuffle=!this.shuffle
    $('fpc-shuffle').classList.toggle('active',this.shuffle)
    Toast.show(this.shuffle?'Acak aktif':'Acak nonaktif','info',1400)
  },

  toggleRepeat(){
    const m=[false,'one','all'], c=m.indexOf(this.repeat)
    this.repeat=m[(c+1)%3]
    $('fpc-repeat').classList.toggle('active',!!this.repeat)
    Toast.show({false:'Ulang nonaktif',one:'Ulang satu',all:'Ulang semua'}[this.repeat],'info',1400)
  },

  likeById(song){
    const liked=Store.get('liked',[])
    const has=liked.some(s=>s.id===song.id)
    Store.set('liked', has?liked.filter(s=>s.id!==song.id):[song,...liked])
    Toast.show(has?'Dihapus dari Disukai':'♥ Ditambahkan ke Disukai',has?'info':'success')
    LibCtrl.updateCounts()
  },

  toggleLike(){
    if(this.current) this.likeById(this.current)
    this._syncLike()
  },

  _syncLike(){
    const liked=Store.get('liked',[])
    const is=this.current&&liked.some(s=>s.id===this.current.id)
    $('fp-like').classList.toggle('liked',!!is)
    $('hero-like')?.classList.toggle('liked',!!is)
  },

  _onEnded(){
    clearInterval(YTPlayer._pollTimer)
    if(this.repeat==='one'){ YTPlayer.seek(0); YTPlayer.play(); return }
    if(this.idx===this.queue.length-1 && !this.repeat){
      this._smartContinue()
    } else {
      this.next()
    }
  },

  async _smartContinue(){
    if(!this.current) return
    try {
      const r=await fetch(`/api/related/${this.current.id}`)
      const data=await r.json()
      const newSongs=(data.results||[]).filter(s=>!this.queue.some(q=>q.id===s.id))
      if(newSongs.length){ this.queue.push(...newSongs.slice(0,10)); this.next() }
    } catch { if(this.repeat==='all') this.next() }
  },

  _onYTProgress(){
    const dur=YTPlayer.getDuration(), cur=YTPlayer.getCurrentTime()
    if(!dur) return
    const pct=(cur/dur)*100
    const seek=$('fp-seek')
    seek.value=pct
    seek.style.setProperty('--pct',pct+'%')
    $('mp-fill').style.width=pct+'%'
    $('fp-cur').textContent=fmt(cur)
    $('fp-dur').textContent=fmt(dur)
    LyricsCtrl.syncAt(cur)
  },

  _setLoad(v){
    if(v){ $('mp-loader')?.classList.remove('hidden'); $('mp-pp')?.classList.add('hidden'); $('fp-buf')?.classList.remove('hidden') }
    else { $('mp-loader')?.classList.add('hidden');    $('mp-pp')?.classList.remove('hidden'); $('fp-buf')?.classList.add('hidden') }
  },

  _setPlay(playing){
    $('fpc-play').innerHTML=playing?PAUSE_IC:PLAY_IC
    $('mp-pp').innerHTML=playing?PAUSE_IC:PLAY_IC
    $('fp-art')?.classList.toggle('playing',playing)
  },

  _updateUI(song){
    const mp=$('mini-player')
    mp.classList.remove('hidden')
    requestAnimationFrame(()=>mp.classList.add('show'))
    $('app').classList.remove('no-player')
    $('mp-thumb').src=song.thumbnail||PH
    $('mp-title').textContent=song.title||''
    $('mp-artist').textContent=song.artist||''
    FP.setSong(song)
    this._syncLike()
    this._setLoad(true)
    requestAnimationFrame(()=>{
      document.querySelectorAll('.mcard,.sitem,.qp-card').forEach(el=>{
        el.classList.toggle('is-playing',el.dataset.id===song.id)
      })
    })
  },

  _saveHist(song){
    const h=Store.get('history',[]).filter(s=>s.id!==song.id)
    h.unshift(song)
    Store.set('history',h.slice(0,80))
    LibCtrl.updateCounts()
    HomeCtrl.refreshRecently()
  },

  _restore(){
    const h=Store.get('history',[])
    if(h.length){ this.current=h[0]; this._updateUI(h[0]); this._setPlay(false); this._setLoad(false) }
  }
}

/* ═══════════════════════════════════════════════
   FULL PLAYER
   ═══════════════════════════════════════════════ */
const FP = {
  show(){ const f=$('full-player'); f.classList.remove('hidden'); f.classList.add('show'); document.body.style.overflow='hidden' },
  hide(){ const f=$('full-player'); f.classList.remove('show'); setTimeout(()=>f.classList.add('hidden'),340); document.body.style.overflow='' },
  setSong(s){
    $('fp-title').textContent=s.title||''
    $('fp-artist').textContent=s.artist||''
    const a=$('fp-art'); a.src=s.thumbnail||PH; a.onerror=()=>a.src=PH
    $('fp-bg').style.backgroundImage=`url(${s.thumbnail})`
    $('fp-glow').style.backgroundImage=`url(${s.thumbnail})`
    LyricsCtrl.load(s)
  }
}

/* ═══════════════════════════════════════════════
   LYRICS CONTROLLER
   ═══════════════════════════════════════════════ */
const LyricsCtrl = {
  _lines:[], _curIdx:-1, _plain:null,

  async load(song){
    this._lines=[]; this._curIdx=-1; this._plain=null
    $('fp-lyric-cur').textContent=''
    $('fp-lyric-next').textContent=''
    const lc=$('lyrics-container')
    if(lc) lc.innerHTML=`<div style="padding:20px 0;text-align:center;color:var(--t3)"><div class="spin-ring" style="margin:0 auto 10px"></div><p style="font-size:.8rem">Memuat lirik...</p></div>`
    try {
      const p=new URLSearchParams({title:song.title||'',artist:song.artist||'',duration:song.durationS||''})
      const res=await fetch('/api/lyrics?'+p, {signal:mkAC('lyrics').signal})
      const data=await res.json()
      if(data.synced){ this._lines=this._parse(data.synced); this._renderSynced(lc) }
      else if(data.plain){ this._plain=data.plain; this._renderPlain(lc) }
      else { if(lc) lc.innerHTML=`<div style="padding:20px 0;text-align:center;color:var(--t3)"><p style="font-size:.83rem">Lirik tidak ditemukan</p></div>` }
    } catch(e){
      if(e.name==='AbortError') return
      if(lc) lc.innerHTML=`<div style="padding:20px 0;text-align:center;color:var(--t3)"><p style="font-size:.83rem">Gagal memuat lirik</p></div>`
    }
  },

  _parse(lrc){
    const lines=[]
    const re=/\[(\d{2}):(\d{2})[.:,](\d{2,3})\]\s*(.*)/g
    let m
    while((m=re.exec(lrc))!==null){
      const t=parseInt(m[1])*60+parseInt(m[2])+parseInt(m[3].length===3?m[3]:m[3]+'0')/1000
      if(m[4].trim()) lines.push({time:t,text:m[4].trim()})
    }
    return lines.sort((a,b)=>a.time-b.time)
  },

  _renderSynced(container){
    if(!container) return
    const frag=document.createDocumentFragment()
    this._lines.forEach((l,i)=>{
      const div=document.createElement('div')
      div.className='lrc-line'; div.dataset.idx=i; div.textContent=l.text
      div.addEventListener('click',()=>{ const d=YTPlayer.getDuration(); if(d>0) YTPlayer.player?.seekTo(l.time,true) },{passive:true})
      frag.appendChild(div)
    })
    container.innerHTML=''; container.appendChild(frag)
  },

  _renderPlain(container){
    if(!container) return
    container.innerHTML=`<div style="font-size:.86rem;line-height:1.85;color:var(--t2);white-space:pre-wrap">${esc(this._plain)}</div>`
  },

  _findIdx(t){
    let lo=0,hi=this._lines.length-1,res=-1
    while(lo<=hi){ const mid=(lo+hi)>>1; if(this._lines[mid].time<=t){res=mid;lo=mid+1}else hi=mid-1 }
    return res
  },

  syncAt(t){
    if(!this._lines.length) return
    const idx=this._findIdx(t)
    if(idx===this._curIdx) return
    this._curIdx=idx
    const cur=$('fp-lyric-cur'),nxt=$('fp-lyric-next')
    if(cur) cur.textContent=idx>=0?this._lines[idx].text:''
    if(nxt) nxt.textContent=(idx+1<this._lines.length)?this._lines[idx+1].text:''
    const lc=$('lyrics-container')
    if(!lc) return
    const lines=lc.querySelectorAll('.lrc-line')
    if(!lines.length) return
    lines.forEach((el,i)=>{
      const active=i===idx
      if(active!==el.classList.contains('active')){
        el.classList.toggle('active',active)
        if(active) el.scrollIntoView({behavior:'smooth',block:'center'})
      }
    })
  }
}

/* ═══════════════════════════════════════════════
   CARD + LIST BUILDERS
   ═══════════════════════════════════════════════ */
function buildCards(songs, container, onPlay){
  const frag=document.createDocumentFragment()
  songs.forEach((s,i)=>{
    const liked=Store.get('liked',[]).some(x=>x.id===s.id)
    const d=document.createElement('div')
    d.className='mcard'+(PlayerCtrl.current?.id===s.id?' is-playing':'')
    d.dataset.id=s.id
    d.innerHTML=`
      <div class="mc-thumb">
        <img class="mc-img" data-src="${s.thumbnail||PH}" alt="" loading="lazy"/>
        <div class="mc-ph"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>
        <div class="mc-overlay"><button class="mc-play-btn" aria-label="Play"><svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg></button></div>
        <button class="mc-like ${liked?'liked':''}" aria-label="Like">${HEART_IC}</button>
        <div class="mc-eq"><div class="mc-eq-b"></div><div class="mc-eq-b"></div><div class="mc-eq-b"></div></div>
      </div>
      <div class="mc-info">
        <p class="mc-title">${esc(s.title)}</p>
        <p class="mc-artist">${esc(s.artist||'Unknown')}</p>
        ${s.duration?`<p class="mc-dur">${s.duration}</p>`:''}
      </div>`
    Lazy.obs(d.querySelector('.mc-img'))
    d.addEventListener('click',e=>{
      const lb=e.target.closest('.mc-like')
      if(lb){ PlayerCtrl.likeById(s); lb.classList.toggle('liked',Store.get('liked',[]).some(x=>x.id===s.id)); return }
      onPlay?onPlay(i):PlayerCtrl.play(s,songs)
    },{passive:true})
    frag.appendChild(d)
  })
  container.innerHTML=''; container.appendChild(frag)
}

function buildSongList(songs, container, extraOpts={}){
  const frag=document.createDocumentFragment()
  songs.forEach((s,i)=>{
    const liked=Store.get('liked',[]).some(x=>x.id===s.id)
    const d=document.createElement('div')
    d.className='sitem'+(PlayerCtrl.current?.id===s.id?' is-playing':'')
    d.dataset.id=s.id; d.dataset.i=i
    d.innerHTML=`
      <div class="s-thumb">
        <img class="s-img" data-src="${s.thumbnail||PH}" alt="" loading="lazy"/>
        <div class="s-eq"><div class="s-eq-b"></div><div class="s-eq-b"></div><div class="s-eq-b"></div></div>
      </div>
      <div class="s-info" style="flex:1;overflow:hidden">
        <p class="s-title">${esc(s.title)}</p>
        <p class="s-meta">${esc(s.artist||'Unknown')}${s.duration?' · '+s.duration:''}</p>
      </div>
      <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
        <button class="s-like-btn ${liked?'liked':''}" aria-label="Like">${HEART_IC}</button>
        <button class="s-more" aria-label="More">${MORE_IC}</button>
      </div>`
    Lazy.obs(d.querySelector('.s-img'))
    frag.appendChild(d)
  })
  container.innerHTML=''; container.appendChild(frag)
  container.addEventListener('click',e=>{
    const item=e.target.closest('.sitem'); if(!item) return
    const i=parseInt(item.dataset.i), s=songs[i]; if(!s) return
    if(e.target.closest('.s-more')){ Modal.playlist(s); return }
    if(e.target.closest('.s-like-btn')){
      PlayerCtrl.likeById(s)
      const lb=item.querySelector('.s-like-btn')
      lb.classList.toggle('liked',Store.get('liked',[]).some(x=>x.id===s.id))
      return
    }
    PlayerCtrl.play(s,songs)
    if(extraOpts.afterPlay) extraOpts.afterPlay(s)
  },{passive:true})
}

function buildSearchResults(songs, container, allSongs){
  const frag=document.createDocumentFragment()
  songs.forEach((s,i)=>{
    const liked=Store.get('liked',[]).some(x=>x.id===s.id)
    const isLyricMatch=!!s._lyricMatch
    const d=document.createElement('div')
    d.className='sitem smart-item'+(PlayerCtrl.current?.id===s.id?' is-playing':'')
    d.dataset.id=s.id; d.dataset.i=i
    d.innerHTML=`
      <div class="s-thumb">
        <img class="s-img" data-src="${s.thumbnail||PH}" alt="" loading="lazy"/>
        <div class="s-eq"><div class="s-eq-b"></div><div class="s-eq-b"></div><div class="s-eq-b"></div></div>
      </div>
      <div class="s-info" style="flex:1;overflow:hidden">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <p class="s-title">${esc(s.title)}</p>
          ${isLyricMatch?`<span class="lrc-badge">🎵 Lirik</span>`:''}
        </div>
        <p class="s-meta">${esc(s.artist||'Unknown')}${s.duration?' · '+s.duration:''}</p>
        ${isLyricMatch&&s._matchedLine?`<p class="s-lyric-preview">"${esc(s._matchedLine.slice(0,80))}"</p>`:''}
      </div>
      <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
        <button class="s-like-btn ${liked?'liked':''}" aria-label="Like">${HEART_IC}</button>
        <button class="s-more" aria-label="More">${MORE_IC}</button>
      </div>`
    Lazy.obs(d.querySelector('.s-img'))
    frag.appendChild(d)
  })
  container.innerHTML=''; container.appendChild(frag)
  container.addEventListener('click',e=>{
    const item=e.target.closest('.sitem'); if(!item) return
    const i=parseInt(item.dataset.i), s=songs[i]; if(!s) return
    if(e.target.closest('.s-more')){ Modal.playlist(s); return }
    if(e.target.closest('.s-like-btn')){
      PlayerCtrl.likeById(s)
      const lb=item.querySelector('.s-like-btn')
      lb.classList.toggle('liked',Store.get('liked',[]).some(x=>x.id===s.id))
      return
    }
    PlayerCtrl.play(s,allSongs)
  },{passive:true})
}

function skCards(n){
  return Array(n).fill(0).map(()=>`<div class="sk-card"><div class="sk-card-t shim"></div><div class="sk-card-i"><div class="sk-line shim" style="height:11px;width:78%"></div><div class="sk-line shim" style="height:9px;width:52%"></div></div></div>`).join('')
}
function skSongs(n){
  return Array(n).fill(0).map(()=>`<div class="sk-song"><div class="sk-st shim"></div><div class="sk-si"><div class="sk-t1 shim"></div><div class="sk-t2 shim"></div></div></div>`).join('')
}

/* ═══════════════════════════════════════════════
   PLAYLIST DETAIL PAGE
   ═══════════════════════════════════════════════ */
const PlaylistDetail = {
  _current: null,
  _caching: false,

  async open(pl){
    this._current = pl
    $('pld-name').textContent = pl.name || 'Playlist'

    // Cover from first song
    const firstThumb = pl.songs?.[0]?.thumbnail
    const artEl = $('pld-art')
    const placeholder = $('pld-art-placeholder')
    if(firstThumb){
      artEl.src = firstThumb
      artEl.classList.remove('hidden')
      placeholder.style.display = 'none'
    } else {
      artEl.classList.add('hidden')
      placeholder.style.display = 'flex'
    }

    const count = pl.songs?.length || 0
    const totalSecs = (pl.songs||[]).reduce((a,s)=>a+(s.durationS||0),0)
    let meta = `${count} lagu`
    if(totalSecs > 0){
      const m = Math.floor(totalSecs/60)
      meta += ` · ${m} menit`
    }
    $('pld-meta').textContent = meta

    // Render songs
    const listEl = $('pld-song-list')
    const emptyEl = $('pld-empty')
    if(!count){
      listEl.innerHTML = ''
      emptyEl.classList.remove('hidden')
    } else {
      emptyEl.classList.add('hidden')
      buildSongList(pl.songs, listEl, {
        afterPlay: ()=>{ /* stay on page */ }
      })
    }

    // Play button
    $('pld-play').onclick = ()=>{
      if(!pl.songs?.length){ Toast.show('Playlist kosong','warning'); return }
      PlayerCtrl.play(pl.songs[0], pl.songs)
      Toast.show(`Memutar ${pl.name}`,'success',1600)
      // Auto-cache all songs in background when user plays playlist
      ric(()=> this._bgCache(pl))
    }

    // Shuffle button
    $('pld-shuffle').onclick = ()=>{
      if(!pl.songs?.length){ Toast.show('Playlist kosong','warning'); return }
      const shuffled = [...pl.songs].sort(()=>Math.random()-.5)
      PlayerCtrl.play(shuffled[0], shuffled)
      Toast.show('Memutar acak','success',1600)
      ric(()=> this._bgCache(pl))
    }

    // Offline download button - update state
    this._updateOfflineBtn(pl)
  },

  async _updateOfflineBtn(pl){
    // Find or create offline button
    let btn = $('pld-offline-btn')
    if(!btn){
      const actionsEl = document.querySelector('.pld-actions')
      if(!actionsEl) return
      btn = document.createElement('button')
      btn.id = 'pld-offline-btn'
      btn.className = 'pld-offline-btn'
      btn.title = 'Simpan untuk offline'
      actionsEl.appendChild(btn)
    }

    if(!pl.songs?.length){ btn.style.display='none'; return }
    btn.style.display=''

    const cachedCount = await OfflineCache.getCachedCount(pl)
    const total = pl.songs.length
    const allCached = cachedCount >= total

    btn.innerHTML = allCached
      ? `<svg viewBox="0 0 24 24" fill="currentColor" style="width:16px;height:16px"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`
    btn.classList.toggle('cached', allCached)
    btn.title = allCached
      ? `Tersimpan offline (${cachedCount}/${total})`
      : `Simpan offline (${cachedCount}/${total} tersimpan)`

    btn.onclick = async ()=> {
      if(allCached){
        Toast.show(`Playlist sudah tersimpan offline (${total} lagu)`,'info')
        return
      }
      if(this._caching){ Toast.show('Sedang menyimpan...','info'); return }
      this._startCache(pl, btn)
    }
  },

  async _startCache(pl, btn){
    this._caching = true
    const total = pl.songs.length
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;animation:spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`
    btn.title = 'Menyimpan...'
    Toast.show(`Menyimpan ${total} lagu untuk offline...`,'info',4000)

    try {
      await OfflineCache.cachePlaylist(pl, (done, total)=>{
        btn.title = `Menyimpan ${done}/${total}...`
      })
      this._caching = false
      Toast.show(`✓ ${total} lagu tersimpan offline!`,'success')
      this._updateOfflineBtn(pl)
    } catch(e){
      this._caching = false
      Toast.show('Gagal menyimpan offline','error')
      this._updateOfflineBtn(pl)
    }
  },

  async _bgCache(pl){
    if(this._caching || !pl.songs?.length) return
    // Silently cache in background
    for(const song of pl.songs){
      const cached = await OfflineCache.isCached(song.id)
      if(!cached) await OfflineCache.cacheSong(song)
    }
    this._updateOfflineBtn(pl)
  },

  refresh(){
    if(this._current){
      PlStore.getAll().then(pls=>{
        const updated = pls.find(p=>p.id===this._current.id)
        if(updated) this.open(updated)
      })
    }
  }
}

/* ═══════════════════════════════════════════════
   DETAIL SHEET
   ═══════════════════════════════════════════════ */
const DetailSheet = {
  _song:null,
  open(song, defaultTab='lyrics'){
    this._song=song
    $('detail-title').textContent=song.title||''
    $('detail-artist').textContent=song.artist||''
    $('detail-info').textContent=[song.album,song.duration].filter(Boolean).join(' · ')
    const t=$('detail-thumb'); t.src=song.thumbnail||PH; t.onerror=()=>t.src=PH
    this._syncLike()
    $('detail-play').onclick=()=>{ PlayerCtrl.play(song); FP.show() }
    $('detail-like').onclick=()=>{ PlayerCtrl.likeById(song); this._syncLike() }
    $('detail-add').onclick=()=>Modal.playlist(song)
    this._switchTab(defaultTab)
    if(PlayerCtrl.current?.id===song.id){
      if(LyricsCtrl._lines.length) LyricsCtrl._renderSynced($('lyrics-container'))
      else if(LyricsCtrl._plain) LyricsCtrl._renderPlain($('lyrics-container'))
    } else {
      LyricsCtrl.load(song)
    }
    this._loadRelated(song.id)
    this._loadArtistInfo(song.artist||'')
    const sheet=$('detail-sheet'),bd=$('detail-backdrop')
    sheet.classList.remove('hidden'); sheet.classList.add('show')
    bd.classList.remove('hidden')
    document.body.style.overflow='hidden'
  },
  close(){
    $('detail-sheet').classList.remove('show')
    $('detail-sheet').classList.add('hidden')
    $('detail-backdrop').classList.add('hidden')
    document.body.style.overflow=''
  },
  _syncLike(){
    const liked=Store.get('liked',[])
    const is=this._song&&liked.some(s=>s.id===this._song.id)
    $('detail-like').classList.toggle('liked',!!is)
  },
  _switchTab(tab){
    document.querySelectorAll('.dtab').forEach(b=>b.classList.toggle('active',b.dataset.dtab===tab))
    document.querySelectorAll('.dtab-panel').forEach(p=>p.classList.toggle('active',p.id==='dtab-'+tab))
  },
  async _loadRelated(id){
    const rl=$('related-list')
    rl.innerHTML=`<div style="padding:20px 0;text-align:center"><div class="spin-ring" style="margin:0 auto"></div></div>`
    try {
      const res=await fetch(`/api/related/${id}`,{signal:mkAC('related').signal})
      const data=await res.json()
      const songs=data.results||[]
      if(!songs.length){rl.innerHTML=`<div style="padding:20px 0;text-align:center;color:var(--t3);font-size:.83rem">Tidak ada rekomendasi</div>`;return}
      buildSongList(songs,rl)
    } catch(e){
      if(e.name==='AbortError') return
      rl.innerHTML=`<div style="padding:20px 0;text-align:center;color:var(--t3);font-size:.83rem">Gagal memuat</div>`
    }
  },
  async _loadArtistInfo(artistName){
    const con=$('artist-info-container')
    if(!artistName){con.innerHTML=`<div class="artist-info-empty"><p>Info artis tidak tersedia</p></div>`;return}
    con.innerHTML=`<div style="padding:24px 0;text-align:center"><div class="spin-ring" style="margin:0 auto"></div></div>`
    try {
      // Use Wikipedia search API (CORS-friendly)
      const wikiSearch = await fetch(
        `https://id.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(artistName+' penyanyi musisi')}&format=json&origin=*&srlimit=1`,
        {signal:AbortSignal.timeout(8000)}
      )
      let wikiData = null
      if(wikiSearch.ok){
        const wjson = await wikiSearch.json()
        const page = wjson?.query?.search?.[0]
        if(page){
          // Fetch extract
          const wikiExtract = await fetch(
            `https://id.wikipedia.org/w/api.php?action=query&pageids=${page.pageid}&prop=extracts|pageimages&exintro=true&exchars=600&pithumbsize=300&format=json&origin=*`,
            {signal:AbortSignal.timeout(8000)}
          )
          if(wikiExtract.ok){
            const wej = await wikiExtract.json()
            const pg = Object.values(wej?.query?.pages||{})[0]
            wikiData = { title: pg?.title, extract: pg?.extract, thumb: pg?.thumbnail?.source }
          }
        }
      }
      // Fallback: English Wikipedia
      if(!wikiData){
        const enSearch = await fetch(
          `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(artistName+' singer musician')}&format=json&origin=*&srlimit=1`,
          {signal:AbortSignal.timeout(8000)}
        )
        if(enSearch.ok){
          const ej = await enSearch.json()
          const page = ej?.query?.search?.[0]
          if(page){
            const enExtract = await fetch(
              `https://en.wikipedia.org/w/api.php?action=query&pageids=${page.pageid}&prop=extracts|pageimages&exintro=true&exchars=600&pithumbsize=300&format=json&origin=*`,
              {signal:AbortSignal.timeout(8000)}
            )
            if(enExtract.ok){
              const wej = await enExtract.json()
              const pg = Object.values(wej?.query?.pages||{})[0]
              wikiData = { title: pg?.title, extract: pg?.extract, thumb: pg?.thumbnail?.source }
            }
          }
        }
      }
      // Also search for their songs
      const songRes = await fetch(`/api/search?q=${encodeURIComponent(artistName)}&limit=6`,{signal:AbortSignal.timeout(6000)}).catch(()=>null)
      const songs = songRes?.ok ? (await songRes.json()).results||[] : []

      this._renderArtistInfo(artistName, wikiData, songs)
    } catch(e){
      if(e.name==='AbortError') return
      con.innerHTML=`<div class="artist-info-empty"><p>Gagal memuat info artis</p></div>`
    }
  },
  _renderArtistInfo(name, wiki, songs){
    const con=$('artist-info-container')
    // Strip HTML tags from extract
    const cleanExtract = wiki?.extract
      ? wiki.extract.replace(/<[^>]+>/g,'').replace(/\n+/g,' ').trim().slice(0,500)
      : null
    con.innerHTML=`
      <div class="artist-profile">
        ${wiki?.thumb ? `<div class="artist-img-wrap"><img src="${wiki.thumb}" alt="${esc(name)}" class="artist-img" onerror="this.closest('.artist-img-wrap').style.display='none'"/></div>` : ''}
        <div class="artist-name-big">${esc(wiki?.title||name)}</div>
        <div class="artist-search-btn-row">
          <button class="artist-search-btn" onclick="SearchCtrl.doSearch(${JSON.stringify(name)});DetailSheet.close()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            Semua lagu ${esc(name)}
          </button>
        </div>
        ${cleanExtract ? `<div class="artist-bio">${esc(cleanExtract)}</div>` : '<div class="artist-bio artist-bio-empty">Biografi tidak tersedia untuk artis ini.</div>'}
        ${wiki ? `<a class="artist-wiki-link" href="https://${wiki.extract?.includes('ika') ? 'id' : 'en'}.wikipedia.org/wiki/${encodeURIComponent(wiki.title||name)}" target="_blank" rel="noopener">Baca selengkapnya di Wikipedia ↗</a>` : ''}
        ${songs.length ? `
        <div class="artist-songs-section">
          <p class="artist-songs-title">Lagu populer</p>
          <div class="artist-songs-list" id="artist-songs-list"></div>
        </div>` : ''}
      </div>`
    if(songs.length){
      buildSongList(songs.slice(0,6), $('artist-songs-list'))
    }
  },
  init(){
    $('detail-close').addEventListener('click',()=>this.close())
    $('detail-backdrop').addEventListener('click',()=>this.close())
    document.querySelectorAll('.dtab').forEach(b=>b.addEventListener('click',()=>this._switchTab(b.dataset.dtab)))
  }
}

/* ═══════════════════════════════════════════════
   HOME CONTROLLER
   ═══════════════════════════════════════════════ */
const HomeCtrl = {
  moodSongs:[],
  init(){
    this._bindChips()
    this.loadMood('santai')
    setTimeout(()=>this.loadTrending(),150)
    setTimeout(()=>this.loadQuickPicks(),300)
    setTimeout(()=>this.refreshRecently(),500)
    $('btn-play-all')?.addEventListener('click',()=>{ if(this.moodSongs.length) PlayerCtrl.play(this.moodSongs[0],this.moodSongs) })
  },
  _bindChips(){
    const moodNames={santai:'Pilihan Santai',fokus:'Musik Fokus',workout:'Workout Mix',party:'Party Hits',kpop:'K-Pop Hits',jazz:'Jazz Lounge',pop:'Pop Hits',rnb:'R&B Vibes',anime:'Anime OST',gaming:'Gaming Mix'}
    document.querySelectorAll('#mood-chips .chip').forEach(btn=>{
      btn.addEventListener('click',()=>{
        document.querySelectorAll('#mood-chips .chip').forEach(b=>b.classList.remove('active'))
        btn.classList.add('active')
        const mood=btn.dataset.mood
        $('mood-title').textContent=moodNames[mood]||'Pilihan Musik'
        this.loadMood(mood)
      })
    })
  },
  async loadMood(mood){
    const g=$('mood-grid'); g.innerHTML=skCards(6)
    try {
      const res=await fetch(`/api/mood/${mood}`,{signal:mkAC('mood').signal})
      const data=await res.json()
      this.moodSongs=data.results||[]
      if(this.moodSongs.length){ this._setHero(this.moodSongs[0]); buildCards(this.moodSongs.slice(0,9),g) }
      else g.innerHTML=''
    } catch(e){
      if(e.name!=='AbortError'){g.innerHTML='';Toast.show('Gagal memuat mood','warning')}
    }
  },
  _setHero(s){
    $('hero-title').textContent=s.title||''
    $('hero-sub').textContent=s.artist||''
    $('hero-bg').style.backgroundImage=`url(${s.thumbnail})`
    $('hero-play').onclick=()=>PlayerCtrl.play(s,this.moodSongs)
    $('hero-queue').onclick=()=>{ PlayerCtrl.queue=[...this.moodSongs]; Toast.show(`${this.moodSongs.length} lagu ke antrean`,'info') }
  },
  async loadTrending(){
    const g=$('trend-grid'); g.innerHTML=skCards(6)
    try {
      const res=await fetch('/api/trending')
      const data=await res.json()
      buildCards(data.results?.slice(0,9)||[],g)
    } catch{ g.innerHTML='' }
  },
  async loadQuickPicks(){
    const g=$('qp-grid')
    try {
      const res=await fetch('/api/mood/pop')
      const data=await res.json()
      const songs=(data.results||[]).slice(0,6)
      const frag=document.createDocumentFragment()
      songs.forEach(s=>{
        const d=document.createElement('div')
        d.className='qp-card'+(PlayerCtrl.current?.id===s.id?' is-playing':'')
        d.dataset.id=s.id
        d.innerHTML=`<img class="qp-thumb" data-src="${s.thumbnail||PH}" alt="" loading="lazy"/><div class="qp-info"><p class="qp-name">${esc(s.title)}</p><p class="qp-artist">${esc(s.artist||'')}</p></div>`
        Lazy.obs(d.querySelector('.qp-thumb'))
        d.addEventListener('click',()=>PlayerCtrl.play(s,songs))
        frag.appendChild(d)
      })
      g.innerHTML=''; g.appendChild(frag)
    } catch{}
  },
  refreshRecently(){
    const hist=Store.get('history',[]).slice(0,10)
    const sec=$('rec-sec'),scrl=$('rec-scroll')
    if(!hist.length||!sec||!scrl){if(sec)sec.style.display='none';return}
    sec.style.display='block'
    const frag=document.createDocumentFragment()
    hist.forEach(s=>{
      const d=document.createElement('div')
      d.style.cssText='flex-shrink:0;width:88px;scroll-snap-align:start;cursor:pointer'
      d.innerHTML=`<div style="border-radius:12px;overflow:hidden;margin-bottom:6px;aspect-ratio:1;background:var(--bg3)"><img data-src="${s.thumbnail||PH}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .3s"/></div><p style="font-size:.69rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.title)}</p><p style="font-size:.62rem;color:var(--t3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.artist||'')}</p>`
      Lazy.obs(d.querySelector('img'))
      d.addEventListener('click',()=>PlayerCtrl.play(s,hist))
      frag.appendChild(d)
    })
    scrl.innerHTML=''; scrl.appendChild(frag)
  }
}

/* ═══════════════════════════════════════════════
   SEARCH HISTORY
   ═══════════════════════════════════════════════ */
const SearchHistory = {
  MAX: 12,
  get(){ return Store.get('search_hist',[]) },
  add(q){
    const h=this.get().filter(x=>x!==q)
    h.unshift(q)
    Store.set('search_hist', h.slice(0,this.MAX))
  },
  clear(){ Store.set('search_hist',[]) },
  render(){
    const h=this.get()
    const el=$('s-history'), list=$('s-hist-list')
    if(!h.length){ el.style.display='none'; return }
    el.style.display='block'
    const frag=document.createDocumentFragment()
    h.slice(0,8).forEach(q=>{
      const d=document.createElement('div')
      d.className='hist-item'
      d.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:15px;height:15px;color:var(--t3);flex-shrink:0"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 14.5 14"/></svg><span>${esc(q)}</span>`
      d.addEventListener('click',()=>{ $('search-input').value=q; SearchCtrl.search(q) },{passive:true})
      frag.appendChild(d)
    })
    list.innerHTML=''; list.appendChild(frag)
  }
}

/* ═══════════════════════════════════════════════
   SEARCH CONTROLLER
   ═══════════════════════════════════════════════ */
const SearchCtrl = {
  _all:[], _rendered:0, _BATCH:12,
  _cache:new Map(), _io:null, _activeFilter:'all',

  doSearch(q){
    // Public method to trigger search and navigate to search page
    Router.go('search')
    const inp=$('search-input')
    if(inp){ inp.value=q; inp.dispatchEvent(new Event('input')) }
    const isLyric=SmartQuery.isLyric(q); this.search(q,isLyric)
  },

  init(){
    const inp=$('search-input'), clr=$('search-clear')
    const doSearch=debounce(q=>{ const isLyric=SmartQuery.isLyric(q); this.search(q,isLyric) }, 380)

    inp.addEventListener('input',()=>{
      const q=inp.value.trim()
      clr.classList.toggle('hidden',!q)
      if(!q){
        this._setState('empty'); mkAC('search').abort()
        $('search-type-bar').classList.add('hidden')
        SearchHistory.render(); $('s-history').style.display='block'; return
      }
      $('s-history').style.display='none'
      this._setState('loading'); this._showSkel()
      this._showTypeHint(q); doSearch(q)
    })

    inp.addEventListener('keydown',e=>{ if(e.key==='Enter'){const q=inp.value.trim();if(q) this.search(q,SmartQuery.isLyric(q))} })

    clr.addEventListener('click',()=>{
      inp.value=''; clr.classList.add('hidden')
      this._setState('empty'); mkAC('search').abort()
      $('search-type-bar').classList.add('hidden')
      $('s-history').style.display='block'; SearchHistory.render(); inp.focus()
    })

    this._io=new IntersectionObserver(entries=>{ if(entries[0].isIntersecting) this._renderMore() },{rootMargin:'80px'})
    this._io.observe($('s-sentinel'))

    document.querySelectorAll('#search-filter-chips .chip').forEach(b=>{
      b.addEventListener('click',()=>{
        document.querySelectorAll('#search-filter-chips .chip').forEach(x=>x.classList.remove('active'))
        b.classList.add('active'); this._activeFilter=b.dataset.filter; this._applyFilter()
      })
    })

    $('clear-hist-btn')?.addEventListener('click',()=>{ SearchHistory.clear(); SearchHistory.render() })
    SearchHistory.render()
  },

  _showTypeHint(q){
    const bar=$('search-type-bar'),lbl=$('search-type-label')
    if(!bar||!lbl) return
    const isLyric=SmartQuery.isLyric(q)
    bar.className='search-type-bar '+(isLyric?'type-lyric':'type-title')
    lbl.textContent=isLyric?'🎵 Mencari berdasarkan lirik...':'🔍 Mencari judul & artis...'
    bar.classList.remove('hidden')
  },

  async search(q, isLyric=false){
    if(this._cache.has(q)){ this._all=this._cache.get(q); this._applyFilter(); SearchHistory.add(q); return }
    this._setState('loading'); this._showSkel()
    try {
      const url=isLyric?`/api/search?q=${encodeURIComponent(q)}&lyric=1`:`/api/search?q=${encodeURIComponent(q)}`
      const res=await fetch(url,{signal:mkAC('search').signal})
      const data=await res.json()
      this._all=data.results||[]
      if(this._all.length<=50) this._cache.set(q,this._all)
      this._applyFilter()
      SearchHistory.add(q)
    } catch(e){
      if(e.name!=='AbortError'){ this._setState('noresult') }
    }
  },

  _applyFilter(){
    const g=$('s-grid'); g.innerHTML=''; this._rendered=0
    let filtered=this._all
    if(this._activeFilter==='lyrics') filtered=this._all.filter(s=>s._lyricMatch)
    else if(this._activeFilter==='songs') filtered=this._all
    this._filtered=filtered
    this._renderMore()
    if(!filtered.length){ this._setState('noresult') }
    else { this._setState('results') }
  },

  _renderMore(){
    if(!this._filtered) return
    const batch=this._filtered.slice(this._rendered,this._rendered+this._BATCH)
    if(!batch.length) return
    const g=$('s-grid')
    if(this._rendered===0) buildSearchResults(batch,g,this._filtered)
    else {
      const frag=document.createDocumentFragment()
      const tempDiv=document.createElement('div')
      buildSearchResults(batch,tempDiv,this._filtered)
      while(tempDiv.firstChild) frag.appendChild(tempDiv.firstChild)
      g.appendChild(frag)
    }
    this._rendered+=batch.length
  },

  _showSkel(){ $('s-loading').innerHTML=skSongs(6) },

  _setState(s){
    ['s-empty','s-loading','s-results','s-noresult'].forEach(id=>$(id)?.classList.add('hidden'))
    const map={empty:'s-empty',loading:'s-loading',results:'s-results',noresult:'s-noresult'}
    $(map[s])?.classList.remove('hidden')
    if(s==='empty') $('s-history').style.display='block'
    else if(s!=='loading') $('s-history').style.display='none'
  }
}

/* ═══════════════════════════════════════════════
   LIBRARY CONTROLLER
   ═══════════════════════════════════════════════ */
const LibCtrl = {
  init(){
    document.querySelectorAll('.ltab').forEach(b=>{
      b.addEventListener('click',()=>{
        document.querySelectorAll('.ltab').forEach(x=>x.classList.remove('active'))
        document.querySelectorAll('.ltab-panel').forEach(p=>p.classList.remove('active'))
        b.classList.add('active')
        document.getElementById('lt-'+b.dataset.tab)?.classList.add('active')
      })
    })
    $('lsp-liked')?.addEventListener('click',()=>{ this._openTab('songs'); this._renderSongs() })
    $('lsp-offline')?.addEventListener('click',()=>{ this._openOfflineSongs() })
    $('lsp-history')?.addEventListener('click',()=>{
      const h=Store.get('history',[]); if(!h.length){Toast.show('Belum ada riwayat','info');return}
      PlayerCtrl.play(h[0],h); Toast.show(`${h.length} lagu dari riwayat`,'success')
    })
    $('lsp-top50')?.addEventListener('click',()=>{
      const h=Store.get('history',[]); if(!h.length){Toast.show('Belum ada data','warning');return}
      PlayerCtrl.play(h[0],h.slice(0,50))
    })
    $('btn-new-pl')?.addEventListener('click',()=>{
      Modal.input('Nama Playlist Baru','',async name=>{
        if(!name.trim()) return
        const pl={id:Date.now()+'',name:name.trim(),songs:[],created:Date.now()}
        await PlStore.save(pl)
        Toast.show('Playlist dibuat!','success')
        this.renderPlaylists()
      })
    })
    this.render()
  },
  render(){ this.updateCounts(); this.renderPlaylists(); this._renderSongs() },
  async updateCounts(){
    const lc=$('liked-cnt'); if(lc) lc.textContent=Store.get('liked',[]).length+' lagu'
    const hc=$('hist-cnt');  if(hc) hc.textContent=Store.get('history',[]).length+' lagu'
    const oc=$('offline-cnt'); if(oc){
      OfflineCache.getAllCached().then(songs=>{ if(oc) oc.textContent=songs.length+' lagu' })
    }
  },
  async _openOfflineSongs(){
    const songs = await OfflineCache.getAllCached()
    if(!songs.length){ Toast.show('Belum ada lagu tersimpan offline','info'); return }
    // Enrich thumbs from cache
    const enriched = await Promise.all(songs.map(async s=>{
      const cachedThumb = await OfflineCache.getCachedThumb(s.id)
      return {...s, thumbnail: cachedThumb || s.thumbnail}
    }))
    this._openTab('songs')
    const el=$('lib-songs'), em=$('lib-songs-empty')
    em?.classList.add('hidden')
    el.innerHTML=''
    // Show header
    const hdr=document.createElement('div')
    hdr.style.cssText='padding:8px 0 12px;display:flex;align-items:center;justify-content:space-between'
    hdr.innerHTML=`<span style="font-size:.78rem;font-weight:700;color:var(--t3);letter-spacing:.04em;text-transform:uppercase">Tersimpan Offline · ${enriched.length} lagu</span>
      <button onclick="LibCtrl.render()" style="font-size:.74rem;color:var(--acc);font-weight:600">Semua</button>`
    el.appendChild(hdr)
    buildSongList(enriched, el)
    Toast.show(`${enriched.length} lagu tersimpan offline`,'success',1800)
  },
  async renderPlaylists(){
    const pls=await PlStore.getAll(), con=$('pl-list')
    if(!pls.length){con.innerHTML='';return}
    const frag=document.createDocumentFragment()
    pls.forEach(p=>{
      const d=document.createElement('div'); d.className='pl-item'; d.dataset.pid=p.id
      const thumb=p.songs?.[0]?.thumbnail
      d.innerHTML=`
        <div class="pl-thumb">
          ${thumb?`<img class="pl-thumb-img" src="${thumb}" alt="" onerror="this.style.display='none'">`:''}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ${thumb?'style="display:none"':''}><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        </div>
        <div style="flex:1;overflow:hidden">
          <p class="pl-name">${esc(p.name)}</p>
          <p class="pl-cnt">${p.songs?.length||0} lagu</p>
        </div>
        <button class="pl-more">${MORE_IC}</button>`

      // Click → open playlist detail page
      d.addEventListener('click',e=>{
        if(e.target.closest('.pl-more')){
          Modal.playlistOptions(p, ()=>this.renderPlaylists())
          return
        }
        Router.go('playlist', p)
      })
      frag.appendChild(d)
    })
    con.innerHTML=''; con.appendChild(frag)
  },
  _renderSongs(){
    const liked=Store.get('liked',[]),el=$('lib-songs'),em=$('lib-songs-empty')
    if(!liked.length){el.innerHTML='';em?.classList.remove('hidden');return}
    em?.classList.add('hidden'); buildSongList(liked,el)
  },
  _openTab(tab){
    document.querySelectorAll('.ltab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab))
    document.querySelectorAll('.ltab-panel').forEach(p=>p.classList.toggle('active',p.id==='lt-'+tab))
  }
}

/* ═══════════════════════════════════════════════
   MODAL
   ═══════════════════════════════════════════════ */
const Modal = {
  async playlist(song){
    const m=$('pl-modal'),list=$('pl-modal-list')
    const pl=await PlStore.getAll()
    if(!pl.length){list.innerHTML='<p style="padding:10px 0;color:var(--t3);font-size:.82rem">Belum ada playlist</p>'}
    else{
      const frag=document.createDocumentFragment()
      list.innerHTML=''
      pl.forEach(p=>{
        const d=document.createElement('div');d.className='modal-li';d.dataset.pid=p.id
        d.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg><span>${esc(p.name)}</span>`
        d.onclick=async()=>{
          m.classList.add('hidden')
          if(!p.songs.find(s=>s.id===song.id)){
            p.songs.push(song)
            await PlStore.save(p)
            Toast.show(`Ditambahkan ke ${p.name}`,'success')
          } else {
            Toast.show('Sudah ada di playlist','warning')
          }
          LibCtrl.renderPlaylists()
          PlaylistDetail.refresh()
        }
        frag.appendChild(d)
      })
      list.appendChild(frag)
    }
    m.classList.remove('hidden')
    $('pl-modal-new').onclick=()=>{
      m.classList.add('hidden')
      this.input('Nama Playlist Baru','',async name=>{
        if(!name.trim()) return
        const np={id:Date.now()+'',name:name.trim(),songs:[song],created:Date.now()}
        await PlStore.save(np)
        Toast.show(`Playlist "${np.name}" dibuat!`,'success')
        LibCtrl.renderPlaylists()
      })
    }
    $('pl-modal-cancel').onclick=()=>m.classList.add('hidden')
    m.onclick=e=>{if(e.target===m)m.classList.add('hidden')}
  },

  playlistOptions(pl, onRefresh){
    // Simple options using input modal as rename
    const choices=['Putar Sekarang','Acak Putar','Ganti Nama','Hapus Playlist']
    // Build a quick sheet
    const m=$('pl-modal'), list=$('pl-modal-list')
    list.innerHTML=''
    const frag=document.createDocumentFragment()
    choices.forEach(choice=>{
      const d=document.createElement('div'); d.className='modal-li'
      d.innerHTML=`<span>${choice}</span>`
      d.onclick=async()=>{
        m.classList.add('hidden')
        if(choice==='Putar Sekarang'){
          if(!pl.songs?.length){Toast.show('Playlist kosong','warning');return}
          PlayerCtrl.play(pl.songs[0],pl.songs)
        } else if(choice==='Acak Putar'){
          if(!pl.songs?.length){Toast.show('Playlist kosong','warning');return}
          const s=[...pl.songs].sort(()=>Math.random()-.5)
          PlayerCtrl.play(s[0],s)
        } else if(choice==='Ganti Nama'){
          this.input('Ganti Nama Playlist',pl.name,async newName=>{
            if(!newName.trim()) return
            pl.name=newName.trim()
            await PlStore.save(pl)
            Toast.show('Nama diperbarui','success')
            onRefresh?.()
          })
        } else if(choice==='Hapus Playlist'){
          await PlStore.delete(pl.id)
          Toast.show('Playlist dihapus','info')
          onRefresh?.()
        }
      }
      frag.appendChild(d)
    })
    list.appendChild(frag)
    $('pl-modal').querySelector('.modal-title').textContent=pl.name
    $('pl-modal-new').style.display='none'
    m.classList.remove('hidden')
    $('pl-modal-cancel').onclick=()=>{ m.classList.add('hidden'); $('pl-modal-new').style.display=''; $('pl-modal').querySelector('.modal-title').textContent='Tambah ke Playlist' }
    m.onclick=e=>{if(e.target===m){ m.classList.add('hidden'); $('pl-modal-new').style.display=''; $('pl-modal').querySelector('.modal-title').textContent='Tambah ke Playlist' }}
  },

  input(title,def,cb){
    const m=$('input-modal'),f=$('input-modal-field')
    $('input-modal-title').textContent=title; f.value=def||''; m.classList.remove('hidden')
    setTimeout(()=>f.focus(),150)
    const ok=()=>{m.classList.add('hidden');cb(f.value)}
    const no=()=>m.classList.add('hidden')
    $('input-ok').onclick=ok; $('input-cancel').onclick=no
    f.onkeydown=e=>{if(e.key==='Enter')ok()}
    m.onclick=e=>{if(e.target===m)no()}
  }
}

/* ═══════════════════════════════════════════════
   PWA
   ═══════════════════════════════════════════════ */
let _dP=null
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();_dP=e})
$('pwa-install')?.addEventListener('click',async()=>{
  if(!_dP){Toast.show('Gunakan menu browser untuk install','info');return}
  _dP.prompt()
  const{outcome}=await _dP.userChoice
  if(outcome==='accepted') Toast.show('Aplikasi diinstall!','success')
  _dP=null
})

/* ═══════════════════════════════════════════════
   HEADER BUTTONS
   ═══════════════════════════════════════════════ */
$('btn-history')?.addEventListener('click',()=>{
  const h=Store.get('history',[]); if(!h.length){Toast.show('Belum ada riwayat','info');return}
  PlayerCtrl.play(h[0],h)
})
$('btn-profile')?.addEventListener('click',()=>Router.go('developer'))

/* ═══════════════════════════════════════════════
   SERVICE WORKER
   ═══════════════════════════════════════════════ */
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}),{passive:true})
}

/* ═══════════════════════════════════════════════
   ONLINE / OFFLINE DETECTION
   ═══════════════════════════════════════════════ */
function updateOnlineStatus(){
  const pill = $('offline-pill')
  if(!pill) return
  pill.classList.toggle('hidden', navigator.onLine)
}
window.addEventListener('online',  ()=>{ updateOnlineStatus(); Toast.show('🌐 Kembali online','success',2000) })
window.addEventListener('offline', ()=>{ updateOnlineStatus(); Toast.show('📶 Mode offline — data tersimpan tetap bisa diputar','warning',3500) })

/* ═══════════════════════════════════════════════
   BOOT
   ═══════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async ()=>{
  // Migrate old storage keys first
  Store.migrate()

  // Sync IDB from localStorage on boot
  await IDB.syncFromLS()

  Router.init()
  PlayerCtrl.init()
  SearchCtrl.init()
  LibCtrl.init()
  DetailSheet.init()
  HomeCtrl.init()
  document.getElementById('pg-home')?.classList.add('active')
  updateOnlineStatus()

  // Preload idle
  ric(()=>{ fetch('/api/trending').catch(()=>{}) })
},{once:true})
