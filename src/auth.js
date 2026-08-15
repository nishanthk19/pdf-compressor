import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import nodemailer from "nodemailer";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Mailtrap Production Email Sending Configuration
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "live.smtp.mailtrap.io",
    port: Number(process.env.SMTP_PORT) || 587,
    auth: {
        user: process.env.SMTP_USER, // usually "api"
        pass: process.env.SMTP_PASS, // your Mailtrap API token / password
    },
});

export const auth = betterAuth({
  baseURL: "https://vibify.tech",
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    baseURL: process.env.BETTER_AUTH_URL || process.env.APP_URL || "https://vibify.tech",
    trustedOrigins: [
        "https://vibify.tech",
        "http://localhost:3000",
        ...(process.env.APP_URL ? [process.env.APP_URL] : []),
        ...(process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : []),
    ],
    emailAndPassword: { enabled: true },
    socialProviders: {
        google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        },
    },
    emailVerification: {
        sendOnSignUp: true,
        sendVerificationEmail: async ({ user, url }) => {
            if (process.env.SMTP_USER && process.env.SMTP_PASS) {
                await transporter.sendMail({
                    from: process.env.SMTP_FROM || '"Vibify" <noreply@vibify.tech>',
                    to: user.email,
                    subject: "Verify your email address",
                    html: `
                        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px;">
                            <h2 style="color: #4f46e5;">Welcome to Vibify!</h2>
                            <p>Please click the button below to verify your email address:</p>
                            <p style="margin: 24px 0;">
                                <a href="${url}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Verify Email</a>
                            </p>
                            <p style="color: #64748b; font-size: 12px;">If you did not request this, you can safely ignore this email.</p>
                        </div>
                    `,
                });
            } else {
                console.log("[Better Auth] Email Verification URL for", user.email, ":", url);
            }
        },
    },
});

export { prisma };