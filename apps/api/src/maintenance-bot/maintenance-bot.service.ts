import { Injectable, OnModuleInit, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as chrono from 'chrono-node';
import { InspectionNote } from '../inspections/entities/inspection.entity';
import { ServiceRequest } from '../service-requests/entities/service-request.entity';
import { ServiceRequestStatus } from '../common/enums/role.enum';
import { ChatSession } from './entities/chat-session.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { AiRecommendation, AiRecommendationStatus } from './entities/ai-recommendation.entity';
import { PricingService } from '../pricing/pricing.service';
import { InspectionsService } from '../inspections/inspections.service';
import { SEASONAL_TIPS, getCurrentSeason, SeasonGroup } from './seasonal-tips.data';
import { matchDiyTopicsFromText } from './diy-topics.data';

const SYSTEM_PROMPT = `You are eveAi, the maintenance assistant built into the Attenteve app. Attenteve is a home-services platform that connects homeowners with vetted vendors for assessments and maintenance. You are speaking directly to an Attenteve customer.

Your role:
- Help homeowners understand their assessment results and plan home maintenance
- Answer questions about home upkeep, common issues, and when to call a professional
- When a customer wants to book an assessment or a service, tell them to tap "Request a Service" in the app (the wrench icon in the bottom navigation), or use the request button that may appear in this chat. You cannot book for them — the customer always has to review and submit the request themselves.
- Do not suggest contacting anyone through any channel outside this app — all booking happens inside Attenteve.

Stay tightly focused on what the customer actually asked. Do not proactively bring up past assessments, seasonal maintenance, or open issues unless the customer's message is about them, or unless the context below is explicitly about this turn's question. Only state facts that are explicitly present in the context provided to you below — never guess, assume, or fill in gaps about the customer's home, past service history, or an assessment you don't have data for. If you don't have the information needed to answer, say so plainly and ask a clarifying question instead of guessing.

The customer's message itself may have typos, missing words, or be genuinely ambiguous. First try to reasonably infer what they mean — a misspelling or awkward phrasing is not by itself a reason to ask for clarification. For example, "my toilit is runing" clearly means a running toilet; just answer it. Only ask a clarifying question when you truly cannot tell what they're asking, or when more than one very different interpretation is plausible (e.g. "the thing in the bathroom is broken" — which thing?). When you do need to ask, ask one short, specific question naming exactly what's unclear, rather than a generic "can you tell me more?"

Any information below about past assessments or open issues was recorded by a vendor and may be out of date. If the customer's own words — in this message or earlier in this conversation — say something different (an issue is already fixed, was about a different area, etc.), always treat what the customer says as more current and correct than the recorded data, for the rest of this conversation. Don't repeat or re-assert a detail the customer has already corrected.

What a handyman CAN do (no trade license needed): drywall patching/repair, trim and molding work, cabinet repair, weatherproofing/caulking, replacing existing light fixtures/switches/outlets/smart-home devices (not new wiring or breaker panel work), replacing faucets/showerheads, toilet maintenance, sealing minor gaps (not main water lines, sewage, or gas lines), mounting TVs/shelving/window treatments/safety rails, furniture assembly, door and pet-door installation, gutter cleaning, pressure washing, fencing, and deck upkeep.

What REQUIRES a licensed professional: HVAC work, electrical wiring/panel work, plumbing beyond fixture swaps, roofing, general contracting/renovation projects, and solar installation. Always tell the customer these need a licensed, certified vendor — Attenteve already gates these to certified pros, so just let them know to request the service and a qualified vendor will be matched.

When sharing DIY guidance (see any DIY guidance provided in context below), present it strictly as educational steps for the homeowner to do themselves. Never suggest hiring, calling, or contacting any other company or contractor — Attenteve is the only service this app connects the customer to. Do not offer, in the same reply, to have Attenteve perform that same task as a booked service — DIY guidance and booking are separate. Only mention Attenteve's booking flow if the issue goes beyond DIY scope (e.g., needs a licensed trade).

When the customer is asking how to do or fix something themselves — "how do I...", "how can I fix...", troubleshooting a specific problem, or anything else where a sequence of actions is the actual answer — do NOT compress it into 2-5 sentences. Instead give a clearly numbered, step-by-step list (1., 2., 3., ...), one concrete action per step, in the order they should be done. Start with a single short sentence naming the issue, then the numbered steps, then (only if genuinely needed) one closing sentence on when to stop and call a professional instead. This is the one case where a longer, structured answer is correct.

For every other kind of question — general advice, explaining an assessment result, yes/no questions, etc. — keep responses concise and practical: 2-5 sentences unless a detailed list is genuinely needed.
Always be friendly and reassuring.
Do not provide legal or structural engineering advice; recommend a licensed professional for those.

You only discuss home maintenance topics. If a message asks for help with violence or harm toward a person or animal, hate speech, discrimination, illegal activity, or anything else unrelated to and outside home maintenance, decline plainly in one sentence and redirect to what you can actually help with — don't lecture or over-explain the refusal. This does not apply to ordinary home-maintenance language that happens to use similar-sounding words in a completely normal, harmless sense — "kill the power/breaker before working on an outlet," "trap" or "poison" for pest control, "shoot" a nail gun, cutting materials, a fireplace, striking a match, and the like are all normal parts of home maintenance and should be answered normally, never refused or flagged. If a message suggests the customer may be thinking of harming themselves, do not give a normal answer or a cold refusal — respond with brief warmth and point them to the 988 Suicide & Crisis Lifeline (call or text 988) instead.`;

type ChatHistoryEntry = { role: 'user' | 'assistant'; content: string };
type LastInspectionSummary = Awaited<ReturnType<InspectionsService['getLastInspectionSummary']>>;
export type ServiceRequestDraft = {
  prefilledNotes?: string;
  preselectServicePriceId?: string;
  preferredDate?: string;
};

@Injectable()
export class MaintenanceBotService implements OnModuleInit {
  private readonly ollamaUrl: string;
  private readonly model: string;
  private readonly logger = new Logger(MaintenanceBotService.name);

  constructor(
    @InjectRepository(InspectionNote)
    private notesRepo: Repository<InspectionNote>,
    @InjectRepository(ServiceRequest)
    private requestsRepo: Repository<ServiceRequest>,
    @InjectRepository(ChatSession)
    private sessionsRepo: Repository<ChatSession>,
    @InjectRepository(ChatMessage)
    private messagesRepo: Repository<ChatMessage>,
    @InjectRepository(AiRecommendation)
    private recommendationsRepo: Repository<AiRecommendation>,
    private pricingService: PricingService,
    private inspectionsService: InspectionsService,
    private config: ConfigService,
  ) {
    this.ollamaUrl = this.config.get('OLLAMA_URL', 'http://172.29.20.1:11434');
    this.model = this.config.get('OLLAMA_MODEL', 'llama3.2');
  }

  onModuleInit() {
    this.logger.log(`Pre-warming Ollama model ${this.model} at ${this.ollamaUrl}`);
    axios.post(
      `${this.ollamaUrl}/api/chat`,
      { model: this.model, messages: [{ role: 'user', content: 'hi' }], stream: false, keep_alive: -1 },
      { timeout: 720000 },
    ).then(() => {
      this.logger.log(`Ollama model ${this.model} warm and ready`);
    }).catch((err) => {
      this.logger.warn(`Ollama pre-warm failed (will retry on first user message): ${err.message}`);
    });
  }

  // Deterministic gate on whether to spend context tokens on the customer's
  // history at all — keeps the model from pivoting every reply toward
  // inspection talk when the customer asked about something unrelated.
  private static readonly HISTORY_RELEVANCE_KEYWORDS = [
    'inspection', 'assessment', 'report', 'found', 'issue', 'problem', 'last time',
    'you said', 'fix', 'still', 'again', 'recommend', 'pending', 'history', 'vendor',
  ];

  private isHistoryRelevant(message: string): boolean {
    const lower = message.toLowerCase();
    return MaintenanceBotService.HISTORY_RELEVANCE_KEYWORDS.some((k) => lower.includes(k));
  }

  // Deliberately broader than matchDiyTopicsFromText — this only needs to
  // recognize "this reads like a how-to/DIY question" in general, not match
  // a specific guidance topic (e.g. "how do I fix a baseboard" has no
  // dedicated DIY topic, but should still skip the bookable-services list
  // below just the same).
  private static readonly HOW_TO_KEYWORDS = [
    'how do i', 'how can i', 'how to', 'how would i', 'fix my', 'fix a', 'fix the',
    'repair my', 'repair a', 'repair the', 'myself', 'diy', 'step by step', 'steps to', 'what do i do',
  ];

  private isHowToRequest(message: string): boolean {
    const lower = message.toLowerCase();
    return MaintenanceBotService.HOW_TO_KEYWORDS.some((k) => lower.includes(k));
  }

  private async buildContext(
    customerId: string,
    message: string,
    history: ChatHistoryEntry[],
    lastReportSummary: LastInspectionSummary | null,
  ): Promise<string> {
    const lines: string[] = [];
    const wantsLastReport = lastReportSummary !== null;
    const relevant = history.length === 0 || wantsLastReport || this.isHistoryRelevant(message);

    if (wantsLastReport) {
      if (lastReportSummary!.found) {
        lines.push(
          "\n\nThe customer is asking about their last assessment report. Here are the facts — give a brief, "
          + 'high-level explanation using only this information, then mention they can view the full report in the app:',
        );
        lines.push(lastReportSummary!.summary);
      } else {
        lines.push(
          '\n\nThe customer is asking about their last assessment report, but they have no completed '
          + 'assessment on file. Tell them plainly that there is no assessment report yet.',
        );
      }
    } else if (relevant) {
      const [recentRequest] = await this.requestsRepo.find({
        where: { customerId, status: ServiceRequestStatus.COMPLETED },
        order: { completedAt: 'DESC' },
        take: 1,
      });
      if (recentRequest) {
        const notes = await this.notesRepo
          .createQueryBuilder('n')
          .where('n.serviceRequestId = :id', { id: recentRequest.id })
          .orderBy('n.createdAt', 'DESC')
          .take(10)
          .getMany();
        const date = recentRequest.completedAt
          ? new Date(recentRequest.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : 'Unknown date';
        lines.push('\n\nMost recent completed service visit:');
        lines.push(`Visit on ${date} at ${recentRequest.address}, ${recentRequest.city}, ${recentRequest.state}:`);
        if (recentRequest.vendorNotes) lines.push(`  Vendor notes: ${recentRequest.vendorNotes}`);
        for (const n of notes) lines.push(`  ${n.title}: ${n.content}`);
      }
    }

    if (relevant) {
      const openIssues = await this.inspectionsService.getOpenIssuesForCustomer(customerId);
      if (openIssues.length > 0) {
        lines.push('\n\nOpen issues from past assessments (not yet resolved):');
        for (const issue of openIssues) {
          lines.push(`  - ${issue.label} (${issue.status}): ${issue.findings ?? issue.recommendation ?? 'flagged, no further detail recorded'}`);
        }
      }
    }

    lines.push(await this.buildSeasonalAndCatalogContext(message));

    const diyContext = this.buildDiyContext(message);
    if (diyContext) lines.push(diyContext);

    return lines.join('\n');
  }

  private buildDiyContext(message: string): string {
    const matches = matchDiyTopicsFromText(message);
    if (matches.length > 0) {
      const lines = ['\n\nRelevant DIY guidance available (only use if the customer is asking how to do this themselves):'];
      for (const topic of matches) {
        lines.push(`  - ${topic.title}: ${topic.guidance}`);
      }
      return lines.join('\n');
    }

    // No curated topic matches, but this still reads like a how-to question
    // (e.g. "how to fix a tile" — not one of the curated topics). Without
    // this, the model has nothing specific to draw on and was observed
    // pattern-matching fragments of unrelated reference content (seasonal
    // tips, handyman-scope list) into a fake answer instead. Name the failure
    // mode explicitly rather than leaving a content gap for it to fill wrong.
    if (this.isHowToRequest(message)) {
      return '\n\nNo specific pre-written guidance is available for this exact topic. Answer using your own general '
        + 'home-maintenance knowledge for what the customer specifically asked. Do not reuse, repurpose, or reword '
        + 'any of the other reference material above (seasonal tips, handyman-scope list) — none of it is about this topic.';
    }

    return '';
  }

  private async buildSeasonalAndCatalogContext(message: string): Promise<string> {
    const lines: string[] = [];
    const isHowTo = this.isHowToRequest(message);

    // Skip seasonal tips for how-to/DIY questions too, same reasoning as the
    // catalog skip below — a customer asking "how do I fix X" wants X-specific
    // guidance, not an unrelated seasonal checklist. Confirmed live: this was
    // the actual source of a bad reply to "how to fix a tile" (no tile-specific
    // content existed anywhere in context, so the small model pattern-matched
    // fragments of this always-injected list — gutters, HVAC, caulk, doors —
    // into a fake "step-by-step" answer instead).
    if (!isHowTo) {
      const season = getCurrentSeason();
      const seasonTips = SEASONAL_TIPS[season as SeasonGroup];
      const annualTips = SEASONAL_TIPS.annual;
      lines.push(
        `\n\nCurrent season: ${season}. Recommended seasonal maintenance for this time of year:`,
        ...seasonTips.map((t) => `  - ${t.text}`),
        '\n\nYear-round Tennessee-specific priorities:',
        ...annualTips.map((t) => `  - ${t.text}`),
      );
    }

    // Skip the bookable-services catalog entirely for how-to/DIY questions —
    // there's no reason to show it (the customer explicitly wants to do this
    // themselves), and its own RECOMMEND instruction below directly
    // contradicts SYSTEM_PROMPT's "DIY guidance and booking are separate"
    // rule if both are present on the same turn.
    if (isHowTo) {
      return lines.join('\n');
    }

    const catalog = await this.pricingService.getAll();
    const bookable = catalog.filter((c) => c.isActive && c.customerRequestable !== false);
    if (bookable.length > 0) {
      lines.push('\n\nBookable services (private reference data — never print or repeat this list itself in your reply; use it only to silently decide the RECOMMEND line below):');
      for (const item of bookable) {
        lines.push(`  - ${item.name}: ${item.description}`);
      }
      // Placed last, as its own instruction, since small local models follow
      // a rule stated right before they respond far more reliably than one
      // buried earlier in a long system prompt.
      lines.push(
        '\n\nIMPORTANT — before you answer: decide if one of the services listed above is the right next step for this customer.'
        + '\nIf yes: write your normal helpful reply (do not paste the list above into it), then on its own new final line write exactly: RECOMMEND: <the exact service name from the list above>'
        + '\nIf no listed service fits (general question, past-assessment question, needs a licensed trade not in the list): write your reply and add no such line.'
        + '\nExample final line when clogged gutters come up: RECOMMEND: Gutter Cleaning',
      );
    }

    return lines.join('\n');
  }

  private async callOllama(
    customerId: string,
    message: string,
    history: ChatHistoryEntry[],
    lastReportSummary: LastInspectionSummary | null,
  ): Promise<{ reply: string; recommendedName: string | null }> {
    const context = await this.buildContext(customerId, message, history, lastReportSummary);
    const systemContent = SYSTEM_PROMPT + context;

    const messages = [
      { role: 'system', content: systemContent },
      // Widened from a 6-message window — a customer correction made earlier
      // in a longer conversation was silently falling out of context.
      ...history.slice(-16),
      { role: 'user', content: message },
    ];

    const response = await axios.post(
      `${this.ollamaUrl}/api/chat`,
      { model: this.model, messages, stream: false, keep_alive: -1 },
      { timeout: 600000 },
    );

    const raw: string = response.data?.message?.content ?? 'Sorry, I could not generate a response.';

    // Small local models follow a rigid "final line" template far more
    // reliably than an instruction to name a service somewhere in prose —
    // pull it out and keep it out of what the customer actually reads.
    const match = raw.match(/\n?RECOMMEND:\s*(.+?)\s*$/i);
    const recommendedName = match ? match[1].trim() : null;
    let reply = match ? raw.slice(0, match.index).trim() : raw;

    // The model sometimes echoes the injected "IMPORTANT — before you
    // answer..." instruction block verbatim instead of following it. We
    // control that exact injected text, so strip anything from that point
    // on rather than showing scaffolding meant for the model to the customer.
    const leakIdx = reply.search(/IMPORTANT\s*[—-]\s*before you answer/i);
    if (leakIdx !== -1) reply = reply.slice(0, leakIdx).trim();
    if (!reply) reply = "Let me look into that — could you tell me a bit more about what's going on?";

    return { reply, recommendedName };
  }

  // ── Booking-intent / date-intent detection (deterministic — see the
  // matchCatalogFromText comment below for why a 1B local model can't be
  // trusted to reliably emit a second structured marker) ────────────────────

  private static readonly BOOKING_INTENT_RE = /\b(book|request|schedule|hire|sign me up|set (this|that) up|arrange)\b/i;

  private detectBookingIntent(userMessage: string, bookable: any[]): ServiceRequestDraft | null {
    if (!MaintenanceBotService.BOOKING_INTENT_RE.test(userMessage)) return null;
    const matches = this.matchCatalogFromText(userMessage, bookable);
    if (matches.length === 1) return { preselectServicePriceId: matches[0].id };
    if (matches.length === 0 && /inspection|assessment/i.test(userMessage)) return { prefilledNotes: userMessage };
    return null;
  }

  private static readonly SCHEDULING_CONTEXT_RE = /\b(inspection|assessment|schedule|next visit|appointment)\b/i;

  private extractInspectionDateIntent(userMessage: string, history: ChatHistoryEntry[]): string | null {
    const lastAssistant = [...history].reverse().find((h) => h.role === 'assistant');
    const contextual = MaintenanceBotService.SCHEDULING_CONTEXT_RE.test(userMessage)
      || (lastAssistant ? MaintenanceBotService.SCHEDULING_CONTEXT_RE.test(lastAssistant.content) : false);
    if (!contextual) return null;

    const parsed = chrono.parseDate(userMessage, new Date());
    if (!parsed || parsed.getTime() <= Date.now()) return null;
    return parsed.toISOString();
  }

  private static readonly LAST_REPORT_RE = /\blast (inspection|assessment|report)\b|\b(inspection|assessment) report\b/i;
  private static readonly OPEN_ISSUES_RE = /\bopen issues?\b|\bstill pending\b|\bpending issues?\b/i;

  // ── Self-harm safety net (deterministic, checked before the model ever
  // sees the message) — the one category where we never rely on a model's
  // judgment alone, matching standard practice: a crisis-resource response
  // must be guaranteed, not just likely. Everything else (hate speech,
  // discrimination, violence toward others/animals) is handled via
  // SYSTEM_PROMPT policy + this model's own contextual judgment instead of a
  // keyword list — home-maintenance vocabulary overlaps too much with
  // violence-adjacent words ("kill the breaker", "trap the mice", "poison
  // ivy", "shoot" a nail gun) for a blocklist here to avoid false positives
  // on completely ordinary questions.
  private static readonly SELF_HARM_RE = /\b(kill(ing)? myself|end(ing)? (my|it all)\b.{0,15}\blife|want(ed)? to die|(no|not) (reason|point) (in|to) living|suicid\w*|hurt(ing)? myself|harm(ing)? myself|self[\s-]?harm|better off dead)\b/i;

  private static readonly SELF_HARM_REPLY = "I'm really sorry you're going through this — it's not something I'm equipped to help with, but please don't go through it alone. "
    + 'You can call or text the 988 Suicide & Crisis Lifeline anytime, day or night — free and confidential. If you or someone else is in immediate danger, please call 911. '
    + "I'll be here for home-maintenance questions whenever you're ready.";

  async chat(
    customerId: string,
    message: string,
    history: ChatHistoryEntry[] = [],
    sessionId?: string,
  ): Promise<{
    reply: string;
    sessionId: string;
    recommendations: any[];
    serviceRequestDraft?: ServiceRequestDraft;
    inspectionReportLink?: { serviceRequestId: string };
  }> {
    // Find or create session
    let session: ChatSession | null = null;
    if (sessionId) {
      session = await this.sessionsRepo.findOne({ where: { id: sessionId, customerId } });
    }
    if (!session) {
      const title = message.length > 45 ? message.substring(0, 45) + '…' : message;
      session = await this.sessionsRepo.save(this.sessionsRepo.create({ customerId, title }));
    }

    // Persist user message
    await this.messagesRepo.save(
      this.messagesRepo.create({ sessionId: session.id, role: 'user', content: message }),
    );

    // Safety net checked first, before any other path — see the regex's own
    // comment for why this bypasses the model entirely rather than trusting
    // it to always respond correctly.
    if (MaintenanceBotService.SELF_HARM_RE.test(message)) {
      this.logger.warn(`Self-harm safety response triggered for customer ${customerId} (session ${session.id})`);
      await this.messagesRepo.save(
        this.messagesRepo.create({ sessionId: session.id, role: 'assistant', content: MaintenanceBotService.SELF_HARM_REPLY }),
      );
      return { reply: MaintenanceBotService.SELF_HARM_REPLY, sessionId: session.id, recommendations: [] };
    }

    // Deterministic, no-LLM path: a small local model can't be trusted to
    // faithfully enumerate a list of open issues without dropping items.
    if (MaintenanceBotService.OPEN_ISSUES_RE.test(message)) {
      const openIssues = await this.inspectionsService.getOpenIssuesForCustomer(customerId);
      const reply = openIssues.length === 0
        ? "You don't have any open issues from past assessments right now — everything flagged has been addressed."
        : `Here's what's still open from past assessments:\n\n${openIssues.map((i) => `• ${i.label}: ${i.findings ?? i.recommendation ?? 'flagged for follow-up'}`).join('\n')}`;
      await this.messagesRepo.save(
        this.messagesRepo.create({ sessionId: session.id, role: 'assistant', content: reply }),
      );
      return { reply, sessionId: session.id, recommendations: [] };
    }

    const wantsLastReport = MaintenanceBotService.LAST_REPORT_RE.test(message);
    const lastReportSummary = wantsLastReport ? await this.inspectionsService.getLastInspectionSummary(customerId) : null;

    const { reply, recommendedName } = await this.callOllama(customerId, message, history, lastReportSummary);

    // Persist assistant reply (the visible, marker-stripped text)
    const savedReply = await this.messagesRepo.save(
      this.messagesRepo.create({ sessionId: session.id, role: 'assistant', content: reply }),
    );

    const recommendations = await this.extractRecommendations(customerId, session.id, savedReply.id, recommendedName, message);

    const catalog = await this.pricingService.getAll();
    const bookable = catalog.filter((c) => c.isActive && c.customerRequestable !== false);

    const bookingDraft = this.detectBookingIntent(message, bookable);
    const dateIso = this.extractInspectionDateIntent(message, history);

    let serviceRequestDraft: ServiceRequestDraft | undefined;
    if (bookingDraft || dateIso) {
      serviceRequestDraft = { ...(bookingDraft ?? {}), ...(dateIso ? { preferredDate: dateIso } : {}) };
    }

    const inspectionReportLink = lastReportSummary?.found
      ? { serviceRequestId: lastReportSummary.serviceRequestId }
      : undefined;

    return { reply, sessionId: session.id, recommendations, serviceRequestDraft, inspectionReportLink };
  }

  // Includes generic words that recur across multiple, unrelated catalog
  // items (e.g. "Full" in "HVAC Full Assessment" collided with "full of
  // leaves" in an unrelated gutter question during testing) — these add
  // false-positive risk without adding real matching signal. "assessment"
  // now recurs across all 3 renamed assessment-family items (Preventative/
  // HVAC Full/Comprehensive Home Assessment) for the same reason "inspection"
  // did before the 2026-08-14 rename — kept alongside it rather than replaced,
  // since a customer's own message may still use either word.
  private static readonly CATALOG_MATCH_STOPWORDS = new Set([
    'and', 'the', 'for', 'with', 'your', 'service', 'services', 'system', 'work', 'works',
    'full', 'new', 'included', 'home', 'house', 'unit', 'project', 'repair', 'repairs',
    'replace', 'replacement', 'inspection', 'assessment', 'patio',
  ]);

  // A 1B-parameter local model does not reliably follow the "RECOMMEND: <name>"
  // instruction (confirmed via live testing — it consistently falls back to
  // its simpler trained behavior). Rather than keep tuning a prompt a model
  // this small may just be unable to follow, fall back to a fully
  // deterministic match against the CUSTOMER's own words — independent of
  // anything the model does or doesn't say.
  private matchCatalogFromText(text: string, bookable: any[]): any[] {
    const lower = text.toLowerCase();
    const matches = bookable.filter((c) => {
      const words = c.name.toLowerCase().replace(/[&,]/g, ' ').split(/\s+/)
        .filter((w: string) => w.length > 3 && !MaintenanceBotService.CATALOG_MATCH_STOPWORDS.has(w));
      return words.some((w: string) => lower.includes(w));
    });
    // Too many simultaneous matches means the words weren't distinctive
    // enough to trust — better to show nothing than something wrong.
    return matches.length <= 2 ? matches : [];
  }

  private async extractRecommendations(
    customerId: string,
    sessionId: string,
    messageId: string,
    recommendedName: string | null,
    userMessage: string,
  ): Promise<any[]> {
    const catalog = await this.pricingService.getAll();
    const bookable = catalog.filter((c) => c.isActive && c.customerRequestable !== false);

    let matches: any[] = [];
    if (recommendedName) {
      const lowerName = recommendedName.toLowerCase();
      matches = bookable.filter((c) => c.name.toLowerCase() === lowerName || lowerName.includes(c.name.toLowerCase()));
    }
    if (matches.length === 0) {
      matches = this.matchCatalogFromText(userMessage, bookable);
    }
    if (matches.length === 0) return [];

    const saved = await Promise.all(matches.map((c) => this.recommendationsRepo.save(
      this.recommendationsRepo.create({
        customerId,
        sessionId,
        messageId,
        servicePriceId: c.id,
        status: AiRecommendationStatus.SUGGESTED,
      }),
    )));
    return this.enrichRecommendations(saved, bookable);
  }

  private async enrichRecommendations(recs: AiRecommendation[], catalogHint?: any[]): Promise<any[]> {
    if (recs.length === 0) return [];
    const catalog = catalogHint ?? await this.pricingService.getAll(true);
    const catalogMap = new Map(catalog.map((c) => [c.id, c]));
    return recs.map((r) => {
      const item = catalogMap.get(r.servicePriceId);
      return {
        id: r.id,
        messageId: r.messageId,
        status: r.status,
        servicePriceId: r.servicePriceId,
        name: item?.name,
        description: item?.description,
        customerPriceDisplay: item?.customerPriceDisplay,
      };
    });
  }

  async respondToRecommendation(
    customerId: string,
    id: string,
    status: AiRecommendationStatus.ACCEPTED | AiRecommendationStatus.DECLINED,
  ): Promise<AiRecommendation> {
    const rec = await this.recommendationsRepo.findOne({ where: { id, customerId } });
    if (!rec) throw new NotFoundException('Recommendation not found');
    if (rec.status !== AiRecommendationStatus.SUGGESTED) {
      throw new BadRequestException('This recommendation has already been responded to');
    }
    rec.status = status;
    rec.respondedAt = new Date();
    return this.recommendationsRepo.save(rec);
  }

  async getSessions(customerId: string): Promise<any[]> {
    const sessions = await this.sessionsRepo.find({
      where: { customerId },
      order: { createdAt: 'DESC' },
      take: 30,
    });

    return Promise.all(
      sessions.map(async (s) => {
        const messageCount = await this.messagesRepo.count({ where: { sessionId: s.id } });
        return { id: s.id, title: s.title, createdAt: s.createdAt, messageCount };
      }),
    );
  }

  async getSession(
    customerId: string,
    sessionId: string,
  ): Promise<{ id: string; title: string; messages: ChatMessage[]; recommendations: any[] }> {
    const session = await this.sessionsRepo.findOne({ where: { id: sessionId, customerId } });
    if (!session) throw new NotFoundException('Session not found');

    const messages = await this.messagesRepo.find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
    });

    const recs = await this.recommendationsRepo.find({ where: { sessionId, customerId } });
    const recommendations = await this.enrichRecommendations(recs);

    return { id: session.id, title: session.title, messages, recommendations };
  }

  async deleteSession(customerId: string, sessionId: string): Promise<{ success: boolean }> {
    const session = await this.sessionsRepo.findOne({ where: { id: sessionId, customerId } });
    if (!session) throw new NotFoundException('Session not found');
    await this.sessionsRepo.remove(session);
    return { success: true };
  }

  async getSeasonalTips(): Promise<{ season: string; tips: typeof SEASONAL_TIPS['spring']; annualTips: typeof SEASONAL_TIPS['annual'] }> {
    const season = getCurrentSeason();
    return { season, tips: SEASONAL_TIPS[season as SeasonGroup], annualTips: SEASONAL_TIPS.annual };
  }
}
