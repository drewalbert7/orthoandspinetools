import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const trackCommunityVisitor = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Only track visits to community pages
    if (req.path.startsWith('/api/communities/') && req.method === 'GET') {
      const communityId = req.params.id;
      
      if (communityId && communityId !== '') {
        // Get user ID from auth token if available
        const userId = (req as any).user?.id || null;
        
        // Get IP address and user agent
        const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
        const userAgent = req.get('User-Agent') || 'unknown';
        
        // Log the visit (don't await to avoid blocking the request)
        prisma.$executeRaw`
          INSERT INTO community_visitor_logs ("communityId", "userId", "ipAddress", "userAgent", "visitDate")
          VALUES (${communityId}, ${userId}, ${ipAddress}, ${userAgent}, NOW())
          ON CONFLICT DO NOTHING
        `.catch(error => {
          console.error('Error tracking visitor:', error);
        });
      }
    }
  } catch (error) {
    console.error('Error in visitor tracking middleware:', error);
  }
  
  next();
};

export const trackContribution = async (communityId: string, userId: string, contributionType: 'post' | 'comment' | 'vote', contributionId?: string) => {
  try {
    await prisma.$executeRaw`
      INSERT INTO community_contributions ("communityId", "userId", "contributionType", "contributionId", "points", "createdAt")
      VALUES (${communityId}, ${userId}, ${contributionType}, ${contributionId || null}, 1, NOW())
    `;
  } catch (error) {
    console.error('Error tracking contribution:', error);
  }
};
