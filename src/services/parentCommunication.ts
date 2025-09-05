import { config } from '../config/environment';

class ParentCommunication {
  private authToken: string | null = null;
  private isReady = false;

  constructor() {
    this.setupMessageListener();
    this.requestAuthToken();
  }

  private setupMessageListener() {
    window.addEventListener('message', (event) => {
      if (event.origin !== config.primaryApp.uiBaseUrl) return;
      
      if (event.data.type === 'HERE_IS_TOKEN') {
        this.authToken = event.data.token;
        this.isReady = true;
        console.log('Auth token received from parent');
      }
    });
  }

  private requestAuthToken() {
    window.parent.postMessage({
      type: 'NEED_AUTH_TOKEN'
    }, config.primaryApp.uiBaseUrl);
  }

  isReadyForAPI(): boolean {
    return true;
    return this.isReady && !!this.authToken;
  }

  getAuthToken(): string | null {
    return this.authToken;
  }
}

export const parentComm = new ParentCommunication();
