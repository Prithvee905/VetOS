package com.vetos;

import com.vetos.platform.config.VetosProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(VetosProperties.class)
public class VetosApiApplication {

	public static void main(String[] args) {
		SpringApplication.run(VetosApiApplication.class, args);
	}

}
