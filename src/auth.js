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
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

export const auth = betterAuth({
    baseURL: process.env.BETTER_AUTH_URL || process.env.APP_URL || "https://vibify.tech",
    trustedOrigins: [
        "https://vibify.tech",
        "http://localhost:3000",
        ...(process.env.APP_URL ? [process.env.APP_URL] : []),
        ...(process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : []),
    ],
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    emailAndPassword: { enabled: true },
    socialProviders: {
        google: {
            clientId: process.env.GOOGLE_CLIENT_ID || "",
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
        },
    },
    emailVerification: {
        sendOnSignUp: true,
        sendVerificationEmail: async ({ user, url }) => {
            try {
                if (process.env.SMTP_USER && process.env.SMTP_PASS) {
                    await transporter.sendMail({
                        from: process.env.SMTP_FROM || '"Vibify" <no-reply@vibify.tech>',
                        to: user.email,
                        subject: "Verify your email address",
                        html: `
                            <div style="font-family: sans-serif; padding: 20px; max-width: 600px; margin: auto;">
                                <h2>Welcome to Vibify!</h2>
                                <p>Please click the button below to verify your email address and activate your account:</p>
                                <a href="${url}" style="background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; margin-top: 10px;">Verify Email</a>
                                <p style="margin-top: 20px; font-size: 12px; color: #666;">If you didn't request this, you can safely ignore this email.</p>
                            </div>
                        `,
                    });
                    console.log(`Verification email successfully sent to ${user.email}`);
                } else {
                    console.log(`[Better Auth] Verification email for ${user.email}: ${url}`);
                }
            } catch (error) {
                console.error("Failed to send verification email:", error);
            }
        },
    },
});

export { prisma };