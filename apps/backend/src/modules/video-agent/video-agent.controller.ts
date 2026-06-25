import { Controller, Post, Get, Body, Param, UseGuards, Req } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { VideoAgentService, VideoJobInput } from './video-agent.service';
import { FreeTierGuardService } from '../cost-control/free-tier-guard.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('video')
@UseGuards(JwtAuthGuard)
export class VideoAgentController {
  constructor(
    private readonly videoAgent: VideoAgentService,
    private readonly freeTier: FreeTierGuardService,
  ) {}

  @Post('create')
  async createVideo(@Req() req: any, @Body() body: VideoJobInput) {
    await this.freeTier.enforce(req.user?.id ?? req.user?.sub, 'video');
    return this.videoAgent.createVideoJob(body);
  }

  @Get('job/:id')
  async getJob(@Param('id') id: string) {
    const job = this.videoAgent.getJob(id);
    if (!job) return { error: 'Job not found' };
    return job;
  }

  @Post('script-preview')
  async previewScript(@Body() body: VideoJobInput) {
    return this.videoAgent.runScriptAgent(body);
  }
}

// ─── BULLMQ PROCESSOR ────────────────────────────────────────────────────
@Processor('video-jobs')
export class VideoJobProcessor extends WorkerHost {
  constructor(private readonly videoAgent: VideoAgentService) { super(); }

  async process(job: Job): Promise<void> {
    const { jobId, input } = job.data as { jobId: string; input: VideoJobInput };
    const videoJob = this.videoAgent.getJob(jobId);
    if (!videoJob) return;

    const update = (status: any, progress: number) => {
      videoJob.status = status;
      videoJob.progress = progress;
    };

    try {
      // Step 1: Script
      update('scripting', 10);
      videoJob.script = await this.videoAgent.runScriptAgent(input);

      // Step 2: Media
      update('fetching_media', 30);
      videoJob.media = await this.videoAgent.runMediaAgent(
        videoJob.script.bRollKeywords, input.duration,
      );

      // Step 3: Voice
      update('generating_voice', 50);
      videoJob.audioUrl = await this.videoAgent.runVoiceAgent(
        videoJob.script.fullNarration, input.lang, input.voiceId,
      );

      // Step 4: Render
      update('rendering', 65);
      videoJob.renderedVideos = await this.videoAgent.runAssemblyAgent(
        videoJob.script, videoJob.media, videoJob.audioUrl, input,
      );

      // Step 5: Publish
      update('publishing', 90);
      videoJob.publishedUrls = await this.videoAgent.runPublishAgent(
        videoJob.renderedVideos, videoJob.script, input,
      );

      update('done', 100);
      videoJob.completedAt = new Date();
    } catch (err: any) {
      videoJob.status = 'failed';
      videoJob.error = err.message;
      throw err;
    }
  }
}
