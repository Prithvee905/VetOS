package com.vetos.integration.outbox;

import java.util.UUID;

public interface OutboxHandler {

	String eventType();

	void handle(UUID clinicId, UUID outboxEventId, String payloadJson) throws Exception;

}
