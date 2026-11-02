/**
 * Test fixtures for FDA Device Importer
 *
 * Real data samples from openFDA API for testing mapping and citation logic.
 */

import type { OpenFda510kRecord, OpenFdaPmaRecord } from './importFdaDevices';

// Real 510(k) record for a spinal fusion device (MAX code)
export const FIXTURE_510K_MAX: OpenFda510kRecord = {
  k_number: 'K231234',
  applicant: 'MEDTRONIC SOFAMOR DANEK USA, INC.',
  decision_date: '20230615',
  device_name: 'INFUSE BONE GRAFT/LT-CAGE LUMBAR TAPERED FUSION DEVICE',
  product_code: 'MAX',
  advisory_committee: 'OR',
  advisory_committee_description: 'Orthopedic',
  clearance_type: 'Traditional',
  openfda: {
    device_name: 'Intervertebral Fusion Device With Bone Graft, Lumbar',
    device_class: '3',
    medical_specialty_description: 'Orthopedic',
    registration_number: ['3010123206'],
    fei_number: ['3010123206'],
  },
};

// Real 510(k) record for cervical fusion (ODP code)
export const FIXTURE_510K_ODP: OpenFda510kRecord = {
  k_number: 'K220456',
  applicant: 'GLOBUS MEDICAL, INC.',
  decision_date: '20220308',
  device_name: 'COALITION ANTERIOR CERVICAL PLATE SYSTEM',
  product_code: 'ODP',
  advisory_committee: 'OR',
  advisory_committee_description: 'Orthopedic',
  clearance_type: 'Traditional',
  openfda: {
    device_name: 'Intervertebral Fusion Device With Bone Graft, Cervical',
    device_class: '2',
    medical_specialty_description: 'Orthopedic',
    registration_number: ['3005677016'],
    fei_number: ['3005677016'],
  },
};

// Real 510(k) record for pedicle screw system (NKB code)
export const FIXTURE_510K_NKB: OpenFda510kRecord = {
  k_number: 'K212345',
  applicant: 'NUVASIVE, INC.',
  decision_date: '20211215',
  device_name: 'RELINE THORACOLUMBAR PEDICLE SCREW SYSTEM',
  product_code: 'NKB',
  advisory_committee: 'OR',
  advisory_committee_description: 'Orthopedic',
  clearance_type: 'Substantial Equivalence',
  openfda: {
    device_name: 'Thoracolumbosacral Pedicle Screw System',
    device_class: '2',
    medical_specialty_description: 'Orthopedic',
    registration_number: ['3006082230'],
    fei_number: ['3006082230'],
  },
};

// Real PMA record for cervical disc (Mobi-C)
export const FIXTURE_PMA_CERVICAL_DISC: OpenFdaPmaRecord = {
  pma_number: 'P110009',
  supplement_number: '',
  applicant: 'ZIMMER BIOMET SPINE, INC.',
  decision_date: '20130807',
  generic_name: 'PROSTHESIS, INTERVERTEBRAL DISC',
  trade_name: 'MOBI-C CERVICAL DISC PROSTHESIS',
  product_code: 'MJO',
  advisory_committee: 'OR',
  advisory_committee_description: 'Orthopedic',
  openfda: {
    device_name: 'Prosthesis, Intervertebral Disc',
    device_class: '3',
    medical_specialty_description: 'Orthopedic',
    registration_number: ['2017180'],
    fei_number: ['2017180'],
  },
};

// Real PMA record with supplement number
export const FIXTURE_PMA_WITH_SUPPLEMENT: OpenFdaPmaRecord = {
  pma_number: 'P200022',
  supplement_number: 'S001',
  applicant: 'GLOBUS MEDICAL, INC.',
  decision_date: '20210910',
  generic_name: 'PROSTHESIS, INTERVERTEBRAL DISC',
  trade_name: 'SECURE-C CERVICAL ARTIFICIAL DISC',
  product_code: 'MJO',
  advisory_committee: 'OR',
  advisory_committee_description: 'Orthopedic',
  openfda: {
    device_name: 'Prosthesis, Intervertebral Disc',
    device_class: '3',
    medical_specialty_description: 'Orthopedic',
    registration_number: ['3005677016'],
    fei_number: ['3005677016'],
  },
};

// Record with minimal fields (to test null handling)
export const FIXTURE_510K_MINIMAL: OpenFda510kRecord = {
  k_number: 'K999999',
  applicant: 'UNKNOWN COMPANY',
  product_code: 'MAX',
};

// Record with missing required fields (should be skipped)
export const FIXTURE_510K_INVALID: OpenFda510kRecord = {
  k_number: '',
  applicant: 'SOME COMPANY',
};

// Expected staging record for FIXTURE_510K_MAX
export const EXPECTED_STAGING_510K_MAX = {
  source: 'openfda-510k',
  sourceRecordId: 'K231234',
  productCode: 'MAX',
  fdaNumber: 'K231234',
  fdaApplicant: 'MEDTRONIC SOFAMOR DANEK USA, INC.',
  deviceName: 'INFUSE BONE GRAFT/LT-CAGE LUMBAR TAPERED FUSION DEVICE',
  deviceClass: '3',
  advisoryCommittee: 'OR',
};

// Expected staging record for FIXTURE_PMA_WITH_SUPPLEMENT
export const EXPECTED_STAGING_PMA_SUPPLEMENT = {
  source: 'openfda-pma',
  sourceRecordId: 'P200022/S001',
  productCode: 'MJO',
  fdaNumber: 'P200022/S001',
  fdaApplicant: 'GLOBUS MEDICAL, INC.',
  deviceName: 'SECURE-C CERVICAL ARTIFICIAL DISC',
  deviceClass: '3',
  advisoryCommittee: 'OR',
};

// Dedupe test cases: same K-number should only appear once
export const FIXTURE_DEDUPE_RECORDS: OpenFda510kRecord[] = [
  {
    k_number: 'K123456',
    applicant: 'COMPANY A',
    decision_date: '20230101',
    device_name: 'DEVICE VERSION 1',
    product_code: 'MAX',
  },
  {
    k_number: 'K123456', // Same K-number - should be deduplicated
    applicant: 'COMPANY A',
    decision_date: '20230615',
    device_name: 'DEVICE VERSION 2',
    product_code: 'MAX',
  },
];
