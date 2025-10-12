# Cloudinary Setup Guide

## 1. Create Cloudinary Account

1. Go to [https://cloudinary.com](https://cloudinary.com)
2. Sign up for a free account
3. Verify your email address

## 2. Get API Credentials

1. Log into your Cloudinary dashboard
2. Go to the Dashboard section
3. Copy the following values:
   - **Cloud Name**: Your cloud name (e.g., `orthoandspinetools`)
   - **API Key**: Your API key
   - **API Secret**: Your API secret

## 3. Configure Environment Variables

### Option A: Using .env file (Recommended)
Create a `.env` file in the project root:

```bash
# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

### Option B: Using Docker Compose
Update the `docker-compose.yml` file with your actual credentials:

```yaml
environment:
  CLOUDINARY_CLOUD_NAME: your-actual-cloud-name
  CLOUDINARY_API_KEY: your-actual-api-key
  CLOUDINARY_API_SECRET: your-actual-api-secret
```

## 4. Restart Services

After setting up the credentials:

```bash
docker-compose down
docker-compose up -d
```

## 5. Test Cloudinary Integration

1. Go to the Create Post page
2. Select "Images & Video" tab
3. Upload an image
4. The image should now be uploaded to Cloudinary and displayed using CDN URLs

## 6. Features Included

- **Automatic Image Optimization**: Images are automatically optimized for web delivery
- **Responsive Images**: Different sizes generated for different screen sizes
- **Video Support**: Videos are uploaded and optimized
- **CDN Delivery**: All media served through Cloudinary's global CDN
- **Reddit-style Sizing**: Images limited to 1200x1200px, videos to 720p
- **Thumbnail Generation**: Automatic thumbnail generation for previews

## 7. Database Schema

The following fields have been added to `post_attachments` table:

- `cloudinaryPublicId`: Cloudinary's public ID for the file
- `cloudinaryUrl`: CDN URL for the file
- `optimizedUrl`: Optimized version URL
- `thumbnailUrl`: Thumbnail version URL
- `width`: Image/video width
- `height`: Image/video height
- `duration`: Video duration (for videos only)

## 8. API Endpoints

New Cloudinary upload endpoints:

- `POST /api/upload/post-images-cloudinary` - Upload images to Cloudinary
- `POST /api/upload/post-videos-cloudinary` - Upload videos to Cloudinary
- `DELETE /api/upload/cloudinary/:publicId` - Delete file from Cloudinary

## 9. Cost Information

- **Free Tier**: 25 credits/month (covers ~25GB storage + 25GB bandwidth)
- **Paid Plans**: Start at $89/month for 100 credits
- **Pay-as-you-go**: $0.10 per credit

## 10. Security

- All uploads are logged for audit purposes
- Files are stored in organized folders (`orthoandspinetools/posts/`)
- Access control through Cloudinary's security features
- HTTPS delivery for all media

## Troubleshooting

### Common Issues:

1. **"Invalid credentials" error**: Check your API key and secret
2. **Upload fails**: Verify your Cloudinary account is active
3. **Images not displaying**: Check if Cloudinary URL is being used instead of local path

### Debug Steps:

1. Check backend logs: `docker-compose logs backend`
2. Verify environment variables: `docker-compose exec backend env | grep CLOUDINARY`
3. Test API endpoint: `curl -X POST http://localhost:3001/api/upload/post-images-cloudinary`
