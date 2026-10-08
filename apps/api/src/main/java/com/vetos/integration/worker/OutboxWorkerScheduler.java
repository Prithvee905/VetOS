package com.vetos.integration.worker;

import com.vetos.integration.outbox.OutboxProcessor;
import com.vetos.platform.config.VetosProperties;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "vetos.workers.enabled", havingValue = "true", matchIfMissing = true)
public class OutboxWorkerScheduler {

	private final OutboxProcessor outboxProcessor;

	public OutboxWorkerScheduler(OutboxProcessor outboxProcessor) {
		this.outboxProcessor = outboxProcessor;
	}

	@Scheduled(fixedDelayString = "PT5S")
	public void drainOutbox() {
		outboxProcessor.processPending(20);
	}

}
