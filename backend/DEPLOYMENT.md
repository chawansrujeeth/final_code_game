# Code Game Deployment Guide

## Prerequisites

- AWS Account with necessary permissions
- GitHub account
- Docker installed locally
- Node.js and npm installed locally
- Supabase project created
- Judge0 API key(s)

## Environment Setup

1. **Create GitHub Repository**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```

2. **Set up GitHub Secrets**
   
   Add the following secrets in your GitHub repository's settings:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `AWS_REGION`
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `JUDGE0_KEY_1`

3. **Set up AWS Resources**

   - Create ECR repository:
     ```bash
     aws ecr create-repository --repository-name code-game
     ```

   - Create ECS cluster:
     ```bash
     aws ecs create-cluster --cluster-name code-game
     ```

   - Create ECS task definition and service (use AWS Console or CLI)

4. **Configure Environment Variables**

   Create a `.env` file in the backend directory:
   ```env
   # Environment
   NODE_ENV=production
   PORT=3001

   # Server Configuration
   HOST=0.0.0.0
   CORS_ORIGIN=https://your-frontend-url.vercel.app

   # Database (Supabase)
   SUPABASE_URL=your_supabase_url
   SUPABASE_ANON_KEY=your_supabase_anon_key

   # Judge0 API Keys
   JUDGE0_KEY_1=your_judge0_api_key

   # Security
   JWT_SECRET=your_secure_random_string

   # Logging
   LOG_LEVEL=info

   # Features
   FEATURE_BATTLE_ROYALE=true
   FEATURE_CF_DUEL=true
   FEATURE_TEAM_DUEL=true
   ```

5. **Set up Database Schema**

   Run the SQL migrations in Supabase:
   1. Go to Supabase dashboard
   2. Navigate to SQL editor
   3. Copy contents from `sql/migrations/001_initial_schema.sql`
   4. Execute the SQL script

## Deployment Process

1. **Initial Deployment**
   - Push code to GitHub main branch
   - GitHub Actions will automatically:
     - Run tests
     - Build Docker image
     - Push to ECR
     - Deploy to ECS

2. **Update Deployment**
   - Simply push changes to main branch
   - CI/CD pipeline will handle the rest

3. **Manual Deployment**
   ```bash
   # Build locally
   docker build -t code-game .

   # Tag
   docker tag code-game:latest <your-ecr-url>/code-game:latest

   # Push
   docker push <your-ecr-url>/code-game:latest
   ```

## Monitoring and Maintenance

1. **Health Checks**
   - Backend health: `https://your-api.com/health`
   - Readiness: `https://your-api.com/ready`

2. **Logs**
   - CloudWatch Logs
   - Application logs in ECS

3. **Backup and Recovery**
   - Supabase automatic backups
   - Manual backups recommended

## Security

1. **Environment Variables**
   - Never commit `.env` files
   - Use GitHub secrets
   - Rotate keys regularly

2. **Network Security**
   - Use AWS Security Groups
   - Enable CORS properly
   - Use HTTPS only

## Vercel Frontend Integration

1. **Environment Variables**
   Set these in Vercel dashboard:
   - `NEXT_PUBLIC_API_URL`: Your AWS backend URL
   - `NEXT_PUBLIC_WS_URL`: Your WebSocket URL

2. **CORS Configuration**
   - Update `CORS_ORIGIN` in backend to match Vercel domain

## Troubleshooting

1. **Common Issues**
   - Check ECS service logs
   - Verify environment variables
   - Check security group settings

2. **Performance Issues**
   - Monitor ECS metrics
   - Check Supabase query performance
   - Scale ECS tasks if needed

## Scaling

1. **Horizontal Scaling**
   - Increase ECS task count
   - Enable auto-scaling

2. **Database Scaling**
   - Monitor Supabase usage
   - Upgrade plan if needed

## Rollback Procedure

1. **Code Rollback**
   ```bash
   # Tag previous version
   git checkout <previous-commit>
   git push -f origin main
   ```

2. **Manual ECS Rollback**
   ```bash
   aws ecs update-service --cluster code-game --service code-game-service --task-definition <previous-task-def>
   ```
