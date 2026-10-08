package com.vetos;

import com.vetos.platform.config.VetosProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableConfigurationProperties(VetosProperties.class)
@EnableScheduling
public class VetosApiApplication {

	public static void main(String[] args) {
		SpringApplication.run(VetosApiApplication.class, args);
	}

}
