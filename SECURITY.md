# Security policy

Optical Voice is experimental software and should not yet be used for sensitive or safety-critical communication.

## Important privacy limitation

The optical stream is visible to any camera with line of sight. A direct screen-to-camera path removes a network intermediary, but it does not provide confidentiality by itself. Until authenticated encryption is explicitly implemented and reviewed, assume transmitted content can be observed and recorded.

## Reporting a vulnerability

Please report security-sensitive issues privately to the maintainer through GitHub's private vulnerability reporting feature when available. Do not include exploitable details in a public issue before the maintainer has had an opportunity to investigate.

A useful report includes:

- affected commit or version;
- browser, operating system, and device;
- reproduction steps;
- expected and observed behaviour;
- impact assessment;
- a minimal proof of concept where appropriate.

## Supported versions

Only the current `main` branch is expected to receive security fixes during the pre-release development phase.

## In scope

Examples include:

- payload or protocol parsing that can execute unintended code;
- origin, permission, or service-worker mistakes that expose microphone/camera access;
- spoofing or cross-session packet confusion;
- integrity checks that can be bypassed;
- cryptographic implementation problems once encryption is introduced;
- denial-of-service inputs that cause unreasonable memory or CPU use.

General optical eavesdropping is a documented property rather than a vulnerability unless a feature explicitly claims to prevent it.
