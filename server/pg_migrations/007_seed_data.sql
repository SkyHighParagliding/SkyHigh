-- Migration 007: seed ground_handling_sites, projects, project_contacts
-- Idempotent: uses ON CONFLICT DO NOTHING

-- Ground handling sites
INSERT INTO ground_handling_sites (id, name, lat, lon, "windDirections", description, notes)
VALUES ('gh-albert-park', 'Albert Park Lake', -37.8467, 144.9736, 'N, NE, E, SE, S, SW, W, NW', 'Large open parkland surrounding Albert Park Lake. Good for all wind directions with plenty of flat, grassy space.', 'Popular with joggers and cyclists — be mindful of others. Best early mornings or weekday afternoons.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO ground_handling_sites (id, name, lat, lon, "windDirections", description, notes)
VALUES ('gh-sandringham-beach', 'Sandringham Beach Reserve', -37.951, 145.01, 'S, SSW, SW, W, WSW', 'Grassy foreshore area with good southerly and westerly wind exposure. Close to the beach.', 'Can get busy on weekends. Dogs off-leash in some areas — watch for tangled lines.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO ground_handling_sites (id, name, lat, lon, "windDirections", description, notes)
VALUES ('gh-point-cook', 'Point Cook Coastal Park', -37.9167, 144.75, 'S, SW, W, NW, N', 'Wide open coastal parkland with consistent sea breezes. Great for practicing in stronger conditions.', 'Park closes at sunset. Check Parks Victoria website for any seasonal closures.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO ground_handling_sites (id, name, lat, lon, "windDirections", description, notes)
VALUES ('gh-jells-park', 'Jells Park', -37.8833, 145.1833, 'N, NE, NW, W', 'Eastern suburbs park with large open grass areas sheltered from southerlies. Good for light wind practice.', 'Multiple flat areas available. The main oval area near the lake is best.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO ground_handling_sites (id, name, lat, lon, "windDirections", description, notes)
VALUES ('gh-you-yangs', 'You Yangs Regional Park', -37.9167, 144.4167, 'N, NE, E, NW', 'Open paddock areas near the You Yangs with good inland wind exposure. Popular with pilots heading to/from western sites.', 'Can be dusty in summer. Bring water and sun protection.')
ON CONFLICT (id) DO NOTHING;

-- Projects
INSERT INTO projects (id, name, description, status, "relatedSiteId", "driveFolderId", "driveFolderName", "parksVic", "pvContactId", "pvExpectations", "worksRequired", "contractorNotes", "landownerNotes", "stakeholderNotes", "projectCoordinator", "coordinatorContactId", "estimatedBudget", "fundingSource", "insuranceRequirements", "supplierQuotes", "complianceNotes", "approvedBy", "approvalDate")
VALUES (
  'proj-yy2qtjlii', 'Portsea Retaining Wall Repair', 'The front retaining wall timber has been kicked out by vandels and requires repairs before errosion of the astroturf sets in.', 'completed',
  'portsea', NULL, NULL, 1,
  'con-0l0kzacb4', 'If supply and delivery of materials or contractors are involved, PV require prior notification to:
1. Have a 3 way contract PV, SH, Contractor confirming public liability insurance.
2. Ensure PV cover internal cultural herritage requirments.
3. Ensure materials are acceptable and not likely to introduce contamination
4. Upload all correspondance using documents at the bottom of this page', 'Replace warped and damaged timber, replace posts and backfill with suitable gravel.', 'Mat Wood to supply materials and labour to perform above repairs.',
  '', 'Docs and photos to be uploaded when google drive is connected', '', 'con-65axmi6qg',
  '', '', '', '',
  '', '', ''
) ON CONFLICT (id) DO NOTHING;

INSERT INTO projects (id, name, description, status, "relatedSiteId", "driveFolderId", "driveFolderName", "parksVic", "pvContactId", "pvExpectations", "worksRequired", "contractorNotes", "landownerNotes", "stakeholderNotes", "projectCoordinator", "coordinatorContactId", "estimatedBudget", "fundingSource", "insuranceRequirements", "supplierQuotes", "complianceNotes", "approvedBy", "approvalDate")
VALUES (
  'proj-i7qjq7and', 'Portsea Wind Station', 'Install unobtrusive wind station', 'active',
  'portsea', NULL, NULL, 0,
  NULL, 'If supply and delivery of materials or contractors are involved, PV require prior notification to:
1. Have a 3 way contract PV, SH, Contractor confirming public liability insurance.
2. Ensure PV cover internal cultural herritage requirments.
3. Ensure materials are acceptable and not likely to introduce contamination
4. Upload all correspondance using documents at the bottom of this page', 'Purchase ultrasonic wind station, board with 4g modem and install to existing post as top of hill behind
 
[Link to Atmos 22](https://metergroup.com/products/atmos-22/?_gl=1*f4t48*_up*MQ..*_gs*MQ..&gclid=Cj0KCQjw37nNBhDkARIsAEBGI8MgNs14pAEF7UBGLy2eelUCmGTXQoekjM26zEPhmJl_crqWqUmn9vUaAgk5EALw_wcB&gbraid=0AAAABApm76rmIJ2wmFeMGU5uexox0MljW)

London Bridge. 
Club member installation', 'N/A',
  'N/A', 'N/A', '', 'con-65axmi6qg',
  '$4000', 'Club Funds', '', '',
  '', '', ''
) ON CONFLICT (id) DO NOTHING;

INSERT INTO projects (id, name, description, status, "relatedSiteId", "driveFolderId", "driveFolderName", "parksVic", "pvContactId", "pvExpectations", "worksRequired", "contractorNotes", "landownerNotes", "stakeholderNotes", "projectCoordinator", "coordinatorContactId", "estimatedBudget", "fundingSource", "insuranceRequirements", "supplierQuotes", "complianceNotes", "approvedBy", "approvalDate")
VALUES (
  'proj-1isii38y0', 'Corrong 2026 Tee Shirts', '1. Design and produce artwork, Main Front Decal & Shoulder Decal.
2. List on TidyHQ shop.
3. Place on socials and Telegram chat
4. Compile order and place with DAS online, payment by CC for reimbursement by SH
5. Collect and take to Corryong.
Notes, Copy of contact details and invoice in documents below.', 'active',
  'mt-elliot', NULL, 'Corrong 2026 Tee Shirts', 0,
  NULL, 'If supply and delivery of materials or contractors are involved, PV require prior notification to:
1. Have a 3 way contract PV, SH, Contractor confirming public liability insurance.
2. Ensure PV cover internal cultural herritage requirments.
3. Ensure materials are acceptable and not likely to introduce contamination
4. Upload all correspondance using documents at the bottom of this page', '', '',
  '', '', '', NULL,
  '', '', '', '',
  '', '', ''
) ON CONFLICT (id) DO NOTHING;

-- Project contacts
INSERT INTO project_contacts ("projectId", "contactId", role)
VALUES ('proj-yy2qtjlii', 'con-0l0kzacb4', 'parks_vic')
ON CONFLICT DO NOTHING;

INSERT INTO project_contacts ("projectId", "contactId", role)
VALUES ('proj-yy2qtjlii', 'con-x3hv5oa04', 'contractor')
ON CONFLICT DO NOTHING;

