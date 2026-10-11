import { Logger } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { EXPLANATION_QUEUE, ExplanationService } from './explanation.service';

// Background worker for LLM explanations — keeps the (slow, laptop-hosted)
// model entirely off the ingestion/rules path.
@Processor(EXPLANATION_QUEUE)
export class ExplanationProcessor {
  private readonly logger = new Logger(ExplanationProcessor.name);

  constructor(private readonly explanations: ExplanationService) {}

  @Process()
  async handle(job: Job<{ eventId: string; evidenceHash: string }>): Promise<void> {
    try {
      await this.explanations.explain(job.data.eventId);
    } catch (err: any) {
      this.logger.warn(`Explanation job for event ${job.data.eventId} failed: ${err.message}`);
    }
  }
}
