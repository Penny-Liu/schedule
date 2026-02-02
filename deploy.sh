#!/bin/bash

# Stop on error
set -e

echo "Starting deployment process..."

# 1. Install Dependencies
echo "Installing dependencies..."
npm install

# 2. Build the project
echo "Building project..."
npm run build

# 3. Push to GitHub (Source)
echo "Pushing source code to GitHub..."
git add .
git commit -m "feat: compact header redesign and excel export refinements" || true
git push || echo "Git push failed, please check your network connection."

# 4. Deploy to GitHub Pages
echo "Deploying to GitHub Pages..."
npm run deploy

echo "Deployment complete!"
