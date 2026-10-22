package com.vetos.platform.application;

import static org.assertj.core.api.Assertions.assertThat;

import com.vetos.platform.application.CampaignService.Recipient;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class CampaignServiceTest {

	@Test
	void sameClientListedManyTimesBecomesOneRecipient() {
		UUID owner = UUID.randomUUID();
		UUID other = UUID.randomUUID();
		List<Recipient> merged = CampaignService.mergeByClient(List.of(
				new Recipient(owner, "Gowri", "Cooby", "6281356498", true, "2026-10-25", ""),
				new Recipient(other, "Nagesh", "buddie", "8464062844", true, "2026-10-26", ""),
				new Recipient(owner, "Gowri", "Cooby", "6281356498", true, "2026-10-24", ""),
				new Recipient(owner, "Gowri", "Tuby", "6281356498", true, "2026-10-27", "")));

		assertThat(merged).hasSize(2);
		Recipient gowri = merged.get(0);
		assertThat(gowri.clientId()).isEqualTo(owner);
		assertThat(gowri.petName()).isEqualTo("Cooby, Tuby");
		assertThat(gowri.dueDate()).isEqualTo("2026-10-24");
		assertThat(merged.get(1).clientId()).isEqualTo(other);
	}

}
