#!/bin/bash

# Friction Intelligence - Deployment Script
# Run this after setting up Supabase and getting all your credentials

echo "🚀 Friction Intelligence Deployment"
echo "===================================="
echo ""

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo "❌ .env.local not found!"
    echo "📝 Please create .env.local from .env.example and fill in your values"
    echo ""
    echo "cp .env.example .env.local"
    echo "# Then edit .env.local with your actual credentials"
    exit 1
fi

echo "✅ Environment file found"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ npm install failed"
    exit 1
fi

echo "✅ Dependencies installed"
echo ""

# Check if vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "📥 Installing Vercel CLI..."
    npm install -g vercel
fi

echo "✅ Vercel CLI ready"
echo ""

# Deploy to Vercel
echo "🚀 Deploying to Vercel..."
echo "   (You'll need to login if this is your first time)"
echo ""

vercel

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Go to Vercel dashboard"
echo "   2. Add environment variables from your .env.local"
echo "   3. Run: vercel --prod"
echo "   4. Update Salesforce callback URL with your Vercel domain"
echo "   5. Deploy edge function: supabase functions deploy analyze-friction"
echo ""
echo "📚 See QUICKSTART.md for detailed instructions"
