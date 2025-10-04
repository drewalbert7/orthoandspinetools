import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Middleware to track community visits
export const trackCommunityVisit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Only track visits to community pages
    if (req.path.startsWith('/api/communities/') && req.method === 'GET') {
      const communityId = req.params.id;
      
      if (communityId) {
        // Get user ID from auth token if available
        const userId = (req as any).user?.id || null;
        
        // Get client IP and user agent
        const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
        const userAgent = req.get('User-Agent') || 'unknown';
        
        // Log the visit (don't await to avoid slowing down the response)
        prisma.communityVisitorLog.create({
          data: {
            communityId: communityId,
            userId: userId,
            ipAddress: ipAddress,
            userAgent: userAgent,
            visitDate: new Date()
          }
        }).catch(error => {
          console.error('Error logging community visit:', error);
        });
      }
    }
  } catch (error) {
    console.error('Error in trackCommunityVisit middleware:', error);
  }
  
  next();
};

// Middleware to track contributions (posts, comments, votes)
export const trackContribution = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id;
    
    if (!userId) {
      return next();
    }
    
    // Track post creation
    if (req.path === '/api/posts' && req.method === 'POST') {
      const communityId = req.body.communityId;
      if (communityId) {
        await prisma.communityContribution.create({
          data: {
            communityId: communityId,
            userId: userId,
            contributionType: 'post',
            contributionId: null, // Will be updated after post creation
            points: 5 // Posts are worth more points
          }
        });
      }
    }
    
    // Track comment creation
    if (req.path.startsWith('/api/posts/') && req.path.includes('/comments') && req.method === 'POST') {
      const postId = req.params.id;
      const post = await prisma.post.findUnique({
        where: { id: postId },
        select: { communityId: true }
      });
      
      if (post) {
        await prisma.communityContribution.create({
          data: {
            communityId: post.communityId,
            userId: userId,
            contributionType: 'comment',
            contributionId: null, // Will be updated after comment creation
            points: 2 // Comments are worth fewer points
          }
        });
      }
    }
    
    // Track votes
    if (req.path.includes('/vote') && req.method === 'POST') {
      const postId = req.params.id;
      const post = await prisma.post.findUnique({
        where: { id: postId },
        select: { communityId: true }
      });
      
      if (post) {
        await prisma.communityContribution.create({
          data: {
            communityId: post.communityId,
            userId: userId,
            contributionType: 'vote',
            contributionId: null,
            points: 1 // Votes are worth the least points
          }
        });
      }
    }
  } catch (error) {
    console.error('Error in trackContribution middleware:', error);
  }
  
  next();
};
