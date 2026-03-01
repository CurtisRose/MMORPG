import Phaser from 'phaser';

interface SplashSceneData {
  errorMessage?: string;
}

interface PendingAuthPayload {
  mode: 'login' | 'register';
  username: string;
  password: string;
}

const AUTH_USERNAME_KEY = 'game-auth-username';
const AUTH_TOKEN_KEY = 'game-auth-token';
const AUTH_TIMEOUT_MS = 8000;

function resolveMultiplayerUrl(): string {
  const configuredUrl = import.meta.env.VITE_MULTIPLAYER_URL as string | undefined;
  return configuredUrl
    ? configuredUrl
    : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:2567`;
}

export class SplashScene extends Phaser.Scene {
  private rootElement: HTMLDivElement | null = null;
  private errorTextElement: HTMLDivElement | null = null;
  private submitButtonElement: HTMLButtonElement | null = null;

  constructor() {
    super('splash');
  }

  create(data: SplashSceneData = {}): void {
    this.cameras.main.setBackgroundColor('#0f1318');
    this.createSplashUi(data.errorMessage);

    this.events.on(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.on(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
  }

  private createSplashUi(initialErrorMessage?: string): void {
    const appElement = document.getElementById('app');
    if (!appElement) {
      return;
    }

    const root = document.createElement('div');
    root.style.position = 'fixed';
    root.style.inset = '0';
    root.style.display = 'flex';
    root.style.alignItems = 'center';
    root.style.justifyContent = 'center';
    root.style.background = 'radial-gradient(circle at 20% 20%, rgba(85,104,131,0.25), rgba(15,19,24,0.95) 60%)';
    root.style.zIndex = '5000';
    root.style.fontFamily = 'monospace';
    root.style.color = '#ebf3ff';

    const card = document.createElement('div');
    card.style.width = 'min(460px, calc(100vw - 36px))';
    card.style.border = '1px solid rgba(183,170,129,0.9)';
    card.style.background = 'rgba(8,10,14,0.9)';
    card.style.boxShadow = '0 10px 30px rgba(0,0,0,0.45)';
    card.style.borderRadius = '8px';
    card.style.padding = '20px';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.gap = '14px';

    const heading = document.createElement('h1');
    heading.textContent = 'Game';
    heading.style.margin = '0';
    heading.style.fontSize = '30px';
    heading.style.letterSpacing = '1px';

    const subtitle = document.createElement('div');
    subtitle.textContent = 'Login to continue';
    subtitle.style.fontSize = '14px';
    subtitle.style.color = '#b8c7dd';

    const modeRow = document.createElement('div');
    modeRow.style.display = 'grid';
    modeRow.style.gridTemplateColumns = '1fr 1fr';
    modeRow.style.gap = '8px';

    const loginButton = this.createModeButton('Login', true);
    const registerButton = this.createModeButton('Create Account', false);

    let mode: 'login' | 'register' = 'login';

    const form = document.createElement('form');
    form.style.display = 'flex';
    form.style.flexDirection = 'column';
    form.style.gap = '10px';

    const usernameInput = this.createInput('text', 'Username');
    const passwordInput = this.createInput('password', 'Password');
    const passwordVerifyInput = this.createInput('password', 'Confirm Password');
    passwordVerifyInput.style.display = 'none';

    const errorText = document.createElement('div');
    errorText.style.minHeight = '18px';
    errorText.style.fontSize = '12px';
    errorText.style.color = '#ff8d8d';
    errorText.textContent = initialErrorMessage ? String(initialErrorMessage) : '';
    this.errorTextElement = errorText;

    const submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.textContent = 'Enter World';
    submitButton.style.padding = '10px 12px';
    submitButton.style.border = '1px solid rgba(183,170,129,0.9)';
    submitButton.style.background = 'rgba(27,33,44,0.9)';
    submitButton.style.color = '#eef5ff';
    submitButton.style.fontFamily = 'monospace';
    submitButton.style.cursor = 'pointer';
    submitButton.style.borderRadius = '5px';
    this.submitButtonElement = submitButton;

    const rememberName = window.localStorage.getItem(AUTH_USERNAME_KEY);
    if (rememberName) {
      usernameInput.value = rememberName;
    }

    const setMode = (nextMode: 'login' | 'register') => {
      mode = nextMode;
      const isLogin = mode === 'login';
      loginButton.style.background = isLogin ? 'rgba(67,83,110,0.9)' : 'rgba(27,33,44,0.9)';
      registerButton.style.background = isLogin ? 'rgba(27,33,44,0.9)' : 'rgba(67,83,110,0.9)';
      passwordVerifyInput.style.display = isLogin ? 'none' : 'block';
      subtitle.textContent = isLogin ? 'Login to continue' : 'Create a new account';
      this.setError('');
    };

    loginButton.addEventListener('click', () => {
      setMode('login');
    });
    registerButton.addEventListener('click', () => {
      setMode('register');
    });

    form.append(usernameInput, passwordInput, passwordVerifyInput, errorText, submitButton);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const username = usernameInput.value.trim().toLowerCase();
      const password = passwordInput.value;
      const passwordVerify = passwordVerifyInput.value;

      if (!username || !password) {
        this.setError('Enter a username and password.');
        return;
      }

      if (mode === 'register' && password !== passwordVerify) {
        this.setError('Passwords do not match.');
        return;
      }

      const pendingAuth: PendingAuthPayload = {
        mode,
        username,
        password,
      };

      this.setSubmitting(true);
      this.setError('');

      const result = await this.authenticateBeforeWorld(pendingAuth);
      this.setSubmitting(false);

      if (!result.ok) {
        this.setError(result.reason ?? 'Authentication failed.');
        return;
      }

      window.localStorage.setItem(AUTH_USERNAME_KEY, username);
      this.scene.start('world');
    });

    modeRow.append(loginButton, registerButton);
    card.append(heading, subtitle, modeRow, form);
    root.appendChild(card);
    appElement.appendChild(root);
    this.rootElement = root;
  }

  private createModeButton(label: string, selected: boolean): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.style.padding = '8px 10px';
    button.style.border = '1px solid rgba(183,170,129,0.9)';
    button.style.background = selected ? 'rgba(67,83,110,0.9)' : 'rgba(27,33,44,0.9)';
    button.style.color = '#f4f7ff';
    button.style.fontFamily = 'monospace';
    button.style.cursor = 'pointer';
    button.style.borderRadius = '5px';
    return button;
  }

  private createInput(type: 'text' | 'password', placeholder: string): HTMLInputElement {
    const input = document.createElement('input');
    input.type = type;
    input.placeholder = placeholder;
    input.autocomplete = type === 'password' ? 'current-password' : 'username';
    input.style.padding = '10px 12px';
    input.style.border = '1px solid rgba(139,147,162,0.75)';
    input.style.background = 'rgba(15,20,29,0.95)';
    input.style.color = '#eff3fa';
    input.style.fontFamily = 'monospace';
    input.style.borderRadius = '5px';
    input.style.outline = 'none';
    return input;
  }

  private setError(message: string): void {
    if (!this.errorTextElement) {
      return;
    }

    this.errorTextElement.textContent = message;
  }

  private setSubmitting(isSubmitting: boolean): void {
    if (!this.submitButtonElement) {
      return;
    }

    this.submitButtonElement.disabled = isSubmitting;
    this.submitButtonElement.textContent = isSubmitting ? 'Authenticating...' : 'Enter World';
    this.submitButtonElement.style.opacity = isSubmitting ? '0.72' : '1';
    this.submitButtonElement.style.cursor = isSubmitting ? 'default' : 'pointer';
  }

  private authenticateBeforeWorld(payload: PendingAuthPayload): Promise<{ ok: true } | { ok: false; reason: string }> {
    const url = resolveMultiplayerUrl();
    const socket = new WebSocket(url);

    return new Promise((resolve) => {
      let settled = false;
      let timeoutHandle: number | null = null;

      const finish = (result: { ok: true } | { ok: false; reason: string }): void => {
        if (settled) {
          return;
        }

        settled = true;
        if (timeoutHandle !== null) {
          window.clearTimeout(timeoutHandle);
        }

        try {
          if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
            socket.close();
          }
        } catch {
          // ignore
        }

        resolve(result);
      };

      timeoutHandle = window.setTimeout(() => {
        finish({ ok: false, reason: 'Authentication timed out. Try again.' });
      }, AUTH_TIMEOUT_MS);

      socket.addEventListener('error', () => {
        finish({ ok: false, reason: 'Could not reach the server.' });
      });

      socket.addEventListener('close', () => {
        if (!settled) {
          finish({ ok: false, reason: 'Connection closed before authentication completed.' });
        }
      });

      socket.addEventListener('message', (event) => {
        let message: unknown;
        try {
          message = JSON.parse(String(event.data));
        } catch {
          return;
        }

        if (!message || typeof message !== 'object') {
          return;
        }

        const typedMessage = message as {
          type?: string;
          reason?: string;
          token?: string;
          username?: string;
        };

        if (typedMessage.type === 'authRequired') {
          if (socket.readyState !== WebSocket.OPEN) {
            return;
          }

          socket.send(
            JSON.stringify({
              type: payload.mode === 'register' ? 'authRegister' : 'authLogin',
              username: payload.username,
              password: payload.password,
            }),
          );
          return;
        }

        if (typedMessage.type === 'authError') {
          finish({ ok: false, reason: String(typedMessage.reason ?? 'Invalid credentials.') });
          return;
        }

        if (typedMessage.type === 'authOk') {
          const token = String(typedMessage.token ?? '');
          const username = String(typedMessage.username ?? payload.username);
          if (!token) {
            finish({ ok: false, reason: 'Authentication succeeded but no token was provided.' });
            return;
          }

          window.localStorage.setItem(AUTH_TOKEN_KEY, token);
          window.localStorage.setItem(AUTH_USERNAME_KEY, username);
          finish({ ok: true });
        }
      });
    });
  }

  private shutdown(): void {
    this.rootElement?.remove();
    this.rootElement = null;
    this.errorTextElement = null;
    this.submitButtonElement = null;
  }
}
