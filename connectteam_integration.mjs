// connectteam_integration.mjs
// Integration to send private messages via ConnectTeam API
// Sends notifications when new MSM Shift Data records are added

import dotenv from 'dotenv';

dotenv.config();

const CONNECTEAM_API_URL = 'https://api.connecteam.com';
const CT_API_KEY = process.env.CT_API_KEY;
const CT_SENDER_ID = process.env.CT_SENDER_ID;

class ConnectTeamIntegration {
  constructor() {
    if (!CT_API_KEY) {
      throw new Error('CT_API_KEY environment variable is required');
    }
    if (!CT_SENDER_ID) {
      throw new Error('CT_SENDER_ID environment variable is required');
    }
    
    this.headers = {
      'Authorization': `Bearer ${CT_API_KEY}`,
      'Content-Type': 'application/json'
    };
  }

  async makeRequest(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...this.headers,
          ...options.headers
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ConnectTeam API Error: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      const result = await response.json();
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('ConnectTeam API request timed out after 10 seconds');
      }
      throw error;
    }
  }

  formatMessage(shiftData) {
    // Extract data from shift record
    const client = shiftData.Customer || 'Unknown Client';
    const shiftDate = shiftData.Date || 'Unknown Date';
    const exceptions = shiftData['Exception Types'] || 'No exceptions noted';
    const schStart = shiftData['Sch Start'] || 'Not specified';
    const actStart = shiftData['Actual Start'] || 'Not recorded';
    const schEnd = shiftData['Sch End'] || 'Not specified';
    const actEnd = shiftData['Actual End'] || 'Not recorded';

    // Format the message with variables
    const message = `Hi, we have a documentation/records issue for your recent shift with ${client} on ${shiftDate} that we need your help to address.

Can you please reply to this message with an explanation as to the issue(s) noted below?

Shift issues are listed below:
${exceptions}

Your shift was scheduled to start at ${schStart} and you clocked in at ${actStart}

Your shift was scheduled to end at ${schEnd} and you clocked out at ${actEnd}`;

    return message;
  }

  async sendPrivateMessage(userId, message) {
    try {
      const url = `${CONNECTEAM_API_URL}/chat/v1/conversations/privateMessage/${userId}`;
      
      const payload = {
        message: message,
        senderId: CT_SENDER_ID
      };

      console.log(`Sending ConnectTeam message to user ${userId}:`, message.substring(0, 100) + '...');
      
      const result = await this.makeRequest(url, {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      console.log(`✅ Successfully sent ConnectTeam message to user ${userId}`);
      return result;
    } catch (error) {
      console.error(`Failed to send ConnectTeam message to user ${userId}:`, error.message);
      throw error;
    }
  }

  async sendShiftNotification(shiftData, employeeUserId) {
    try {
      if (!employeeUserId) {
        console.log('No ConnectTeam user ID found for employee, skipping notification');
        return false;
      }

      const message = this.formatMessage(shiftData);
      await this.sendPrivateMessage(employeeUserId, message);
      return true;
    } catch (error) {
      console.error('Failed to send shift notification:', error.message);
      return false;
    }
  }
}

export default ConnectTeamIntegration;
