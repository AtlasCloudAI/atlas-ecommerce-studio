import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { prisma } from '@/lib/prisma';
import { grantCredits } from '@/lib/credits';

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
  ],
  session: { strategy: 'database' },
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.credits = (user as { credits?: number }).credits ?? 0;
      }
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      const bonus = parseInt(process.env.SIGNUP_BONUS_CREDITS || '0', 10);
      if (bonus > 0 && user.id) await grantCredits(user.id, bonus, 'signup');
    },
  },
  pages: { signIn: '/' },
};
