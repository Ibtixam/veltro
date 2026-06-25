import { Controller, Post, Get, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ClusteringService } from './clustering.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RawKeyword } from './keyword-cluster.engine';

@Controller('clusters')
@UseGuards(JwtAuthGuard)
export class ClusteringController {
  constructor(private readonly clustering: ClusteringService) {}

  // Analyze a URL — auto-expand and cluster
  @Post('analyze-url')
  async analyzeUrl(@Body() body: { url: string; seeds?: string[] }) {
    return this.clustering.analyzeUrl(body.url, body.seeds);
  }

  // Analyze a manual keyword list
  @Post('analyze-keywords')
  async analyzeKeywords(@Body() body: { keywords: RawKeyword[] }) {
    return this.clustering.analyzeKeywords(body.keywords);
  }

  // Get top clusters for a domain
  @Get('top/:domain')
  async getTop(@Param('domain') domain: string, @Query('limit') limit?: string) {
    return this.clustering.getTopClusters(domain, limit ? parseInt(limit) : 20);
  }

  // Generate programmatic SEO page seeds
  @Post('programmatic')
  async generateProgrammatic(@Body() body: {
    baseKeyword: string;
    countries: string[];
    cities: string[];
    industries: string[];
  }) {
    const seeds = await this.clustering.generateProgrammaticSeeds(
      body.baseKeyword,
      body.countries,
      body.cities,
      body.industries,
    );
    return this.clustering.analyzeKeywords(seeds);
  }
}
