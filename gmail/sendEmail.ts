import { google } from 'googleapis';
import { GmailCredentials, EmailConfig } from './types';
import fs from 'fs/promises';

export class GmailService {
  private auth;
  private gmail;

  constructor(credentials: GmailCredentials) {
    this.auth = new google.auth.OAuth2(
      credentials.clientId,
      credentials.clientSecret,
      credentials.redirectUri
    );

    this.auth.setCredentials({
      refresh_token: credentials.refreshToken
    });

    this.gmail = google.gmail({ version: 'v1', auth: this.auth });
  }

  private createMessage(emailConfig: EmailConfig): string {
    const message = [
      'Content-Type: text/html; charset=utf-8',
      'MIME-Version: 1.0',
      `To: ${emailConfig.to.join(', ')}`,
      `From: ${emailConfig.from}`,
      `Subject: ${emailConfig.subject}`,
      '',
      emailConfig.body
    ].join('\r\n');

    return Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  async sendEmail(emailConfig: EmailConfig): Promise<void> {
    try {
      const raw = this.createMessage(emailConfig);
      await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw
        }
      });
      console.log('Email sent successfully!');
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  }

  async createDraft(emailConfig: EmailConfig): Promise<void> {
    try {
      const raw = this.createMessage(emailConfig);
      await this.gmail.users.drafts.create({
        userId: 'me',
        requestBody: {
          message: {
            raw
          }
        }
      });
      console.log('Draft created successfully!');
    } catch (error) {
      console.error('Error creating draft:', error);
      throw error;
    }
  }

  async composeAndSendEmail(emailConfig: EmailConfig): Promise<void> {
    try {
      console.log('Composing and sending email...');
      await this.sendEmail(emailConfig);
    } catch (error) {
      console.error('Error composing and sending email:', error);
      throw error;
    }
  }

  async composeCreateDraftAndSend(emailConfig: EmailConfig): Promise<void> {
    try {
      console.log('Composing, creating draft, and sending email...');
      await this.createDraft(emailConfig);
      await this.sendEmail(emailConfig);
    } catch (error) {
      console.error('Error composing, creating draft, and sending email:', error);
      throw error;
    }
  }

  async listDrafts(): Promise<void> {
    try {
      const response = await this.gmail.users.drafts.list({
        userId: 'me'
      });
      console.log('Drafts:', response.data);
    } catch (error) {
      console.error('Error listing drafts:', error);
      throw error;
    }
  }
}

import { config } from 'dotenv';
import { GmailService } from './gmailService';
import fs from 'fs/promises';
import path from 'path';

config();

async function readFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    throw error;
  }
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  try {
    // Read credentials from gmailapi.txt
    const credentialsRaw = await readFile('gmailapi.txt');
    const credentials = JSON.parse(credentialsRaw);

    // Read email list
    const emailListRaw = await readFile('email.txt');
    const emailList = emailListRaw.split('\n').map(email => email.trim()).filter(Boolean);

    // Read subject and from
    const subject = await readFile('subject.txt');
    const from = await readFile('from.txt');

    // Read HTML email content
    const htmlBody = await readFile('emailBody.html');

    const gmailService = new GmailService({
      clientId: credentials.client_id,
      clientSecret: credentials.client_secret,
      redirectUri: credentials.redirect_uri,
      refreshToken: credentials.refresh_token
    });

    const emailConfigTemplate = {
      from: from.trim(),
      subject: subject.trim(),
      body: htmlBody
    };

    const emailsPerBatch = 10; // Number of emails to send per batch
    const delayBetweenBatches = 5000; // Delay between batches in milliseconds

    for (let i = 0; i < emailList.length; i += emailsPerBatch) {
      const batch = emailList.slice(i, i + emailsPerBatch);
      const emailConfig = { ...emailConfigTemplate, to: batch };

      // Send emails in batch
      console.log(`Sending batch of ${batch.length} emails...`);
      await gmailService.composeAndSendEmail(emailConfig);

      // Delay between batches
      if (i + emailsPerBatch < emailList.length) {
        console.log(`Waiting ${delayBetweenBatches}ms before sending next batch...`);
        await delay(delayBetweenBatches);
      }
    }

    console.log('All emails sent successfully!');

  } catch (error) {
    console.error('Error in main function:', error);
    process.exit(1);
  }
}

main();
