```html

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>xCall</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    :root {
      --bg-primary: #0a0a0a;
      --bg-secondary: #111111;
      --bg-tertiary: #1a1a1a;
      --text-primary: #fafafa;
      --text-secondary: #a1a1a1;
      --text-muted: #6b6b6b;
      --accent: #14b8a6;
      --accent-hover: #0d9488;
      --border: #262626;
      --destructive: #ef4444;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background-color: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* Header */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 24px;
      border-bottom: 1px solid var(--border);
      background-color: var(--bg-primary);
    }

    .logo {
      font-size: 24px;
      font-weight: 600;
      letter-spacing: -0.5px;
    }

    .logo span {
      color: var(--accent);
    }

    .header-center {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: var(--accent);
      animation: pulse 2s infinite;
    }

    .status-dot.searching {
      background-color: #eab308;
    }

    .status-dot.disconnected {
      background-color: var(--text-muted);
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .status-text {
      font-size: 14px;
      color: var(--text-secondary);
    }

    .online-users {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      background-color: var(--bg-secondary);
      border-radius: 9999px;
      border: 1px solid var(--border);
    }

    .online-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: #22c55e;
      animation: pulse 2s infinite;
    }

    .online-count {
      font-size: 14px;
      font-weight: 500;
    }

    .online-label {
      font-size: 14px;
      color: var(--text-secondary);
    }

    /* Main Content */
    .main {
      flex: 1;
      display: flex;
      gap: 16px;
      padding: 16px;
      min-height: 0;
    }

    .video-panel {
      flex: 1;
      position: relative;
      background-color: var(--bg-secondary);
      border-radius: 16px;
      border: 1px solid var(--border);
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .video-panel img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .video-label {
      position: absolute;
      bottom: 16px;
      left: 16px;
      padding: 6px 12px;
      background-color: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(8px);
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
    }

    .video-placeholder {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      color: var(--text-muted);
    }

    .video-placeholder svg {
      width: 64px;
      height: 64px;
      opacity: 0.5;
    }

    .video-placeholder span {
      font-size: 14px;
    }

    /* Connection Overlay */
    .connection-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background-color: var(--bg-secondary);
      gap: 16px;
    }

    .connection-overlay.hidden {
      display: none;
    }

    .spinner {
      width: 48px;
      height: 48px;
      border: 3px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .connection-text {
      font-size: 16px;
      font-weight: 500;
    }

    .connection-timer {
      font-size: 14px;
      color: var(--text-muted);
      font-variant-numeric: tabular-nums;
    }

    /* Control Bar */
    .control-bar {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 12px;
      padding: 20px;
      background-color: var(--bg-primary);
      border-top: 1px solid var(--border);
    }

    .control-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 52px;
      height: 52px;
      border-radius: 50%;
      border: 1px solid var(--border);
      background-color: var(--bg-secondary);
      color: var(--text-primary);
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .control-btn:hover {
      background-color: var(--bg-tertiary);
      border-color: var(--text-muted);
    }

    .control-btn.muted {
      background-color: var(--destructive);
      border-color: var(--destructive);
    }

    .control-btn.muted:hover {
      background-color: #dc2626;
    }

    .control-btn svg {
      width: 22px;
      height: 22px;
    }

    .action-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 0 28px;
      height: 52px;
      border-radius: 9999px;
      border: none;
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .action-btn.primary {
      background-color: var(--accent);
      color: var(--bg-primary);
    }

    .action-btn.primary:hover {
      background-color: var(--accent-hover);
    }

    .action-btn.secondary {
      background-color: var(--bg-secondary);
      color: var(--text-primary);
      border: 1px solid var(--border);
    }

    .action-btn.secondary:hover {
      background-color: var(--bg-tertiary);
    }

    .action-btn.danger {
      background-color: var(--destructive);
      color: white;
    }

    .action-btn.danger:hover {
      background-color: #dc2626;
    }

    .action-btn svg {
      width: 18px;
      height: 18px;
    }

    .divider {
      width: 1px;
      height: 32px;
      background-color: var(--border);
      margin: 0 8px;
    }
  </style>
</head>
<body>
  <!-- Header -->
  <header class="header">
    <div class="logo">drift<span>.</span></div>
    <div class="header-center">
      <div class="status-dot" id="statusDot"></div>
      <span class="status-text" id="statusText">Ready to connect</span>
    </div>
    <div class="online-users">
      <div class="online-dot"></div>
      <span class="online-count" id="onlineCount">4,832</span>
      <span class="online-label">online</span>
    </div>
  </header>

  <!-- Main Content -->
  <main class="main">
    <!-- Your Video -->
    <div class="video-panel">
      <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&h=600&fit=crop&crop=face" alt="Your video" />
      <div class="video-label">You</div>
    </div>

    <!-- Stranger Video -->
    <div class="video-panel" id="strangerPanel">
      <div class="video-placeholder" id="placeholder">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
        </svg>
        <span>Click "Start" to find someone</span>
      </div>
      <div class="connection-overlay hidden" id="connectionOverlay">
        <div class="spinner"></div>
        <span class="connection-text">Looking for someone...</span>
        <span class="connection-timer" id="timer">0:00</span>
      </div>
      <img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=800&h=600&fit=crop&crop=face" alt="Stranger video" id="strangerVideo" style="display: none;" />
      <div class="video-label" id="strangerLabel" style="display: none;">Friend</div>
    </div>
  </main>

  <!-- Control Bar -->
  <footer class="control-bar">
    <button class="control-btn" id="micBtn" title="Toggle microphone">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
      </svg>
    </button>
    <button class="control-btn" id="videoBtn" title="Toggle camera">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
      </svg>
    </button>

    <div class="divider"></div>

    <button class="action-btn primary" id="startBtn">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
      </svg>
      Start
    </button>

    <button class="action-btn secondary hidden" id="skipBtn">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8.688c0-.864.933-1.405 1.683-.977l7.108 4.062a1.125 1.125 0 010 1.953l-7.108 4.062A1.125 1.125 0 013 16.81V8.688zM12.75 8.688c0-.864.933-1.405 1.683-.977l7.108 4.062a1.125 1.125 0 010 1.953l-7.108 4.062a1.125 1.125 0 01-1.683-.977V8.688z" />
      </svg>
      Skip
    </button>

    <button class="action-btn danger hidden" id="stopBtn">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
      Stop
    </button>
  </footer>

  <script>
    // State
    let state = 'idle'; // idle, searching, connected
    let timerInterval = null;
    let seconds = 0;
    let onlineCount = 4832;

    // Elements
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const onlineCountEl = document.getElementById('onlineCount');
    const placeholder = document.getElementById('placeholder');
    const connectionOverlay = document.getElementById('connectionOverlay');
    const strangerVideo = document.getElementById('strangerVideo');
    const strangerLabel = document.getElementById('strangerLabel');
    const timerEl = document.getElementById('timer');
    const startBtn = document.getElementById('startBtn');
    const skipBtn = document.getElementById('skipBtn');
    const stopBtn = document.getElementById('stopBtn');
    const micBtn = document.getElementById('micBtn');
    const videoBtn = document.getElementById('videoBtn');

    // Update online count randomly
    setInterval(() => {
      const change = Math.floor(Math.random() * 50) - 25;
      onlineCount = Math.max(2000, Math.min(7000, onlineCount + change));
      onlineCountEl.textContent = onlineCount.toLocaleString();
    }, 3000);

    // Timer functions
    function startTimer() {
      seconds = 0;
      timerInterval = setInterval(() => {
        seconds++;
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
      }, 1000);
    }

    function stopTimer() {
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
    }

    // State updates
    function updateUI() {
      if (state === 'idle') {
        statusDot.className = 'status-dot disconnected';
        statusText.textContent = 'Ready to connect';
        placeholder.style.display = 'flex';
        connectionOverlay.classList.add('hidden');
        strangerVideo.style.display = 'none';
        strangerLabel.style.display = 'none';
        startBtn.classList.remove('hidden');
        skipBtn.classList.add('hidden');
        stopBtn.classList.add('hidden');
      } else if (state === 'searching') {
        statusDot.className = 'status-dot searching';
        statusText.textContent = 'Searching...';
        placeholder.style.display = 'none';
        connectionOverlay.classList.remove('hidden');
        strangerVideo.style.display = 'none';
        strangerLabel.style.display = 'none';
        startBtn.classList.add('hidden');
        skipBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');
      } else if (state === 'connected') {
        statusDot.className = 'status-dot';
        statusText.textContent = 'Connected';
        placeholder.style.display = 'none';
        connectionOverlay.classList.add('hidden');
        strangerVideo.style.display = 'block';
        strangerLabel.style.display = 'block';
        startBtn.classList.add('hidden');
        skipBtn.classList.remove('hidden');
        stopBtn.classList.remove('hidden');
      }
    }

    // Button handlers
    startBtn.addEventListener('click', () => {
      state = 'searching';
      updateUI();
      startTimer();
      
      // Simulate finding someone after 2-4 seconds
      setTimeout(() => {
        if (state === 'searching') {
          stopTimer();
          state = 'connected';
          updateUI();
        }
      }, 2000 + Math.random() * 2000);
    });

    stopBtn.addEventListener('click', () => {
      stopTimer();
      state = 'idle';
      updateUI();
    });

    skipBtn.addEventListener('click', () => {
      state = 'searching';
      updateUI();
      startTimer();
      
      setTimeout(() => {
        if (state === 'searching') {
          stopTimer();
          state = 'connected';
          updateUI();
        }
      }, 2000 + Math.random() * 2000);
    });

    // Toggle buttons
    micBtn.addEventListener('click', () => {
      micBtn.classList.toggle('muted');
    });

    videoBtn.addEventListener('click', () => {
      videoBtn.classList.toggle('muted');
    });

    // Initialize
    updateUI();
  </script>
</body>
</html>
```