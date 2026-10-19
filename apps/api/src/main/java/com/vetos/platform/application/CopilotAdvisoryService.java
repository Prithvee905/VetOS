package com.vetos.platform.application;

import com.vetos.clinical.application.ClinicalWorkflowService;
import com.vetos.platform.api.ApiException;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class CopilotAdvisoryService {

	private final ClinicalWorkflowService clinicalWorkflowService;

	public CopilotAdvisoryService(ClinicalWorkflowService clinicalWorkflowService) {
		this.clinicalWorkflowService = clinicalWorkflowService;
	}

	public AdvisoryResponse advise(UUID clinicId, UUID patientId) {
		ClinicalWorkflowService.PatientTimelineResponse timeline = clinicalWorkflowService.getPatientTimeline(clinicId, patientId);
		if (timeline == null) {
			throw ApiException.notFound();
		}

		List<String> suggestions = new ArrayList<>();
		suggestions.add("Review the chronological timeline before prescribing to avoid duplicate therapies.");
		if (timeline.events().isEmpty()) {
			suggestions.add("No prior clinical events recorded — confirm vaccination history with the pet owner.");
		}
		else {
			long consultCount = timeline.events().stream().filter(e -> "CONSULTATION".equals(e.eventType())).count();
			if (consultCount == 0) {
				suggestions.add("Consider documenting a SOAP consultation for medico-legal completeness.");
			}
			boolean hasRx = timeline.events().stream().anyMatch(e -> "PRESCRIPTION".equals(e.eventType()));
			if (hasRx) {
				suggestions.add("Verify dispense status and inventory batch expiry before checkout.");
			}
		}
		suggestions.add("Advisory only — clinician retains full responsibility for diagnosis and treatment.");

		return new AdvisoryResponse(patientId, suggestions, "RULE_BASED_V1");
	}

	public record AdvisoryResponse(UUID patientId, List<String> suggestions, String engineVersion) {
	}

}
