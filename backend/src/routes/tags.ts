import { Router, Request, Response } from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireCommunityModerator } from '../middleware/authorization';
import { PrismaClient } from '@prisma/client';
import { body, param, validationResult } from 'express-validator';

const router = Router();
const prisma = new PrismaClient();

// Get all tags for a community
router.get('/communities/:communityId/tags', 
  asyncHandler(async (req: Request, res: Response) => {
    const { communityId } = req.params;

    const tags = await prisma.communityTag.findMany({
      where: {
        communityId: communityId
      },
      orderBy: {
        name: 'asc'
      }
    });

    res.json(tags);
  })
);

// Create a new tag for a community (moderator/admin only)
router.post('/communities/:communityId/tags',
  authenticate,
  requireCommunityModerator,
  [
    body('name').trim().notEmpty().withMessage('Tag name is required'),
    body('color').optional().isString(),
    body('description').optional().isString()
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { communityId } = req.params;
    const { name, color, description } = req.body;

    // Validate color format if provided (must be valid hex color)
    if (color && typeof color === 'string' && color.trim()) {
      const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;
      if (!hexColorRegex.test(color.trim())) {
        throw new AppError('Color must be a valid hex color code (e.g., #FF5733)', 400);
      }
    }

    // Check if tag already exists for this community
    const existingTag = await prisma.communityTag.findUnique({
      where: {
        communityId_name: {
          communityId,
          name: name.trim()
        }
      }
    });

    if (existingTag) {
      throw new AppError('A tag with this name already exists in this community', 400);
    }

    // Verify community exists
    const community = await prisma.community.findUnique({
      where: { id: communityId }
    });

    if (!community) {
      throw new AppError('Community not found', 404);
    }

    const tag = await prisma.communityTag.create({
      data: {
        communityId,
        name: name.trim(),
        color: color && typeof color === 'string' ? color.trim() : null,
        description: description && typeof description === 'string' ? description.trim() : null
      }
    });

    res.status(201).json(tag);
  })
);

// Update a tag (moderator/admin only)
router.put('/communities/:communityId/tags/:tagId',
  authenticate,
  requireCommunityModerator,
  [
    body('name').optional().trim().notEmpty().withMessage('Tag name cannot be empty'),
    body('color').optional().isString(),
    body('description').optional().isString()
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { communityId, tagId } = req.params;
    const { name, color, description } = req.body;

    // Validate color format if provided (must be valid hex color)
    if (color !== undefined && color !== null && typeof color === 'string' && color.trim()) {
      const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;
      if (!hexColorRegex.test(color.trim())) {
        throw new AppError('Color must be a valid hex color code (e.g., #FF5733)', 400);
      }
    }

    // Verify tag exists and belongs to this community
    const existingTag = await prisma.communityTag.findUnique({
      where: { id: tagId }
    });

    if (!existingTag) {
      throw new AppError('Tag not found', 404);
    }

    if (existingTag.communityId !== communityId) {
      throw new AppError('Tag does not belong to this community', 403);
    }

    // If name is being changed, check for duplicates
    if (name && name.trim() !== existingTag.name) {
      const duplicateTag = await prisma.communityTag.findUnique({
        where: {
          communityId_name: {
            communityId,
            name: name.trim()
          }
        }
      });

      if (duplicateTag) {
        throw new AppError('A tag with this name already exists in this community', 400);
      }
    }

    const updatedTag = await prisma.communityTag.update({
      where: { id: tagId },
      data: {
        ...(name && { name: name.trim() }),
        ...(color !== undefined && { color: color && typeof color === 'string' ? color.trim() : null }),
        ...(description !== undefined && { description: description && typeof description === 'string' ? description.trim() : null })
      }
    });

    res.json(updatedTag);
  })
);

// Delete a tag (moderator/admin only)
router.delete('/communities/:communityId/tags/:tagId',
  authenticate,
  requireCommunityModerator,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { communityId, tagId } = req.params;

    // Verify tag exists and belongs to this community
    const existingTag = await prisma.communityTag.findUnique({
      where: { id: tagId }
    });

    if (!existingTag) {
      throw new AppError('Tag not found', 404);
    }

    if (existingTag.communityId !== communityId) {
      throw new AppError('Tag does not belong to this community', 403);
    }

    // Delete the tag (cascade will remove all post_tags associations)
    await prisma.communityTag.delete({
      where: { id: tagId }
    });

    res.json({ message: 'Tag deleted successfully' });
  })
);

export default router;

