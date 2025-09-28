import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// Get all communities
router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const communities = [
    {
      id: 'spine',
      name: 'Spine',
      slug: 'spine',
      description: 'Community for spine surgery professionals discussing spinal disorders, procedures, and treatments.',
      specialty: 'Spine Surgery',
      memberCount: 1240,
      postCount: 156,
      createdAt: '2024-01-15T00:00:00Z',
      updatedAt: '2024-01-15T00:00:00Z'
    },
    {
      id: 'sports',
      name: 'Sports',
      slug: 'sports',
      description: 'Sports medicine community for orthopedic professionals treating athletic injuries and performance optimization.',
      specialty: 'Sports Medicine',
      memberCount: 980,
      postCount: 234,
      createdAt: '2024-01-15T00:00:00Z',
      updatedAt: '2024-01-15T00:00:00Z'
    },
    {
      id: 'ortho-trauma',
      name: 'Ortho Trauma',
      slug: 'ortho-trauma',
      description: 'Emergency orthopedic trauma surgery community for acute injury management and fracture care.',
      specialty: 'Orthopedic Trauma',
      memberCount: 750,
      postCount: 189,
      createdAt: '2024-01-15T00:00:00Z',
      updatedAt: '2024-01-15T00:00:00Z'
    },
    {
      id: 'ortho-peds',
      name: 'Ortho Peds',
      slug: 'ortho-peds',
      description: 'Pediatric orthopedic surgery community for treating musculoskeletal conditions in children.',
      specialty: 'Pediatric Orthopedics',
      memberCount: 420,
      postCount: 98,
      createdAt: '2024-01-15T00:00:00Z',
      updatedAt: '2024-01-15T00:00:00Z'
    },
    {
      id: 'ortho-onc',
      name: 'Ortho Onc',
      slug: 'ortho-onc',
      description: 'Orthopedic oncology community for bone and soft tissue tumor treatment and limb salvage procedures.',
      specialty: 'Orthopedic Oncology',
      memberCount: 180,
      postCount: 45,
      createdAt: '2024-01-15T00:00:00Z',
      updatedAt: '2024-01-15T00:00:00Z'
    },
    {
      id: 'foot-ankle',
      name: 'Foot & Ankle',
      slug: 'foot-ankle',
      description: 'Foot and ankle surgery community for complex reconstructive procedures and sports injuries.',
      specialty: 'Foot & Ankle Surgery',
      memberCount: 320,
      postCount: 87,
      createdAt: '2024-01-15T00:00:00Z',
      updatedAt: '2024-01-15T00:00:00Z'
    },
    {
      id: 'shoulder-elbow',
      name: 'Shoulder Elbow',
      slug: 'shoulder-elbow',
      description: 'Shoulder and elbow surgery community for arthroscopic and reconstructive procedures.',
      specialty: 'Shoulder & Elbow Surgery',
      memberCount: 450,
      postCount: 112,
      createdAt: '2024-01-15T00:00:00Z',
      updatedAt: '2024-01-15T00:00:00Z'
    },
    {
      id: 'hip-knee-arthroplasty',
      name: 'Hip & Knee Arthroplasty',
      slug: 'hip-knee-arthroplasty',
      description: 'Joint replacement surgery community for hip and knee arthroplasty procedures and implant discussions.',
      specialty: 'Joint Replacement',
      memberCount: 890,
      postCount: 203,
      createdAt: '2024-01-15T00:00:00Z',
      updatedAt: '2024-01-15T00:00:00Z'
    },
    {
      id: 'hand',
      name: 'Hand',
      slug: 'hand',
      description: 'Hand surgery community for microsurgery, trauma, and reconstructive procedures of the hand and wrist.',
      specialty: 'Hand Surgery',
      memberCount: 380,
      postCount: 94,
      createdAt: '2024-01-15T00:00:00Z',
      updatedAt: '2024-01-15T00:00:00Z'
    }
  ];

  res.json({
    success: true,
    data: communities
  });
}));

// Get single community by ID
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  
  const communities = [
    {
      id: 'spine',
      name: 'Spine',
      slug: 'spine',
      description: 'Community for spine surgery professionals discussing spinal disorders, procedures, and treatments.',
      specialty: 'Spine Surgery',
      memberCount: 1240,
      postCount: 156,
      createdAt: '2024-01-15T00:00:00Z',
      updatedAt: '2024-01-15T00:00:00Z'
    },
    {
      id: 'sports',
      name: 'Sports',
      slug: 'sports',
      description: 'Sports medicine community for orthopedic professionals treating athletic injuries and performance optimization.',
      specialty: 'Sports Medicine',
      memberCount: 980,
      postCount: 234,
      createdAt: '2024-01-15T00:00:00Z',
      updatedAt: '2024-01-15T00:00:00Z'
    },
    {
      id: 'ortho-trauma',
      name: 'Ortho Trauma',
      slug: 'ortho-trauma',
      description: 'Emergency orthopedic trauma surgery community for acute injury management and fracture care.',
      specialty: 'Orthopedic Trauma',
      memberCount: 750,
      postCount: 189,
      createdAt: '2024-01-15T00:00:00Z',
      updatedAt: '2024-01-15T00:00:00Z'
    },
    {
      id: 'ortho-peds',
      name: 'Ortho Peds',
      slug: 'ortho-peds',
      description: 'Pediatric orthopedic surgery community for treating musculoskeletal conditions in children.',
      specialty: 'Pediatric Orthopedics',
      memberCount: 420,
      postCount: 98,
      createdAt: '2024-01-15T00:00:00Z',
      updatedAt: '2024-01-15T00:00:00Z'
    },
    {
      id: 'ortho-onc',
      name: 'Ortho Onc',
      slug: 'ortho-onc',
      description: 'Orthopedic oncology community for bone and soft tissue tumor treatment and limb salvage procedures.',
      specialty: 'Orthopedic Oncology',
      memberCount: 180,
      postCount: 45,
      createdAt: '2024-01-15T00:00:00Z',
      updatedAt: '2024-01-15T00:00:00Z'
    },
    {
      id: 'foot-ankle',
      name: 'Foot & Ankle',
      slug: 'foot-ankle',
      description: 'Foot and ankle surgery community for complex reconstructive procedures and sports injuries.',
      specialty: 'Foot & Ankle Surgery',
      memberCount: 320,
      postCount: 87,
      createdAt: '2024-01-15T00:00:00Z',
      updatedAt: '2024-01-15T00:00:00Z'
    },
    {
      id: 'shoulder-elbow',
      name: 'Shoulder Elbow',
      slug: 'shoulder-elbow',
      description: 'Shoulder and elbow surgery community for arthroscopic and reconstructive procedures.',
      specialty: 'Shoulder & Elbow Surgery',
      memberCount: 450,
      postCount: 112,
      createdAt: '2024-01-15T00:00:00Z',
      updatedAt: '2024-01-15T00:00:00Z'
    },
    {
      id: 'hip-knee-arthroplasty',
      name: 'Hip & Knee Arthroplasty',
      slug: 'hip-knee-arthroplasty',
      description: 'Joint replacement surgery community for hip and knee arthroplasty procedures and implant discussions.',
      specialty: 'Joint Replacement',
      memberCount: 890,
      postCount: 203,
      createdAt: '2024-01-15T00:00:00Z',
      updatedAt: '2024-01-15T00:00:00Z'
    },
    {
      id: 'hand',
      name: 'Hand',
      slug: 'hand',
      description: 'Hand surgery community for microsurgery, trauma, and reconstructive procedures of the hand and wrist.',
      specialty: 'Hand Surgery',
      memberCount: 380,
      postCount: 94,
      createdAt: '2024-01-15T00:00:00Z',
      updatedAt: '2024-01-15T00:00:00Z'
    }
  ];

  const community = communities.find(c => c.id === id || c.slug === id);
  
  if (!community) {
    return res.status(404).json({
      success: false,
      message: 'Community not found'
    });
  }

  return res.json({
    success: true,
    data: community
  });
}));

export default router;
