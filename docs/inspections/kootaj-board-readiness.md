# Kootaj Board Readiness Inspection

Date: 2026-06-19

Status: superseded.

The standalone `/kootaj-board` page and `/api/kootaj-board` aliases were removed. Daily Status is the operational board surface, and Shipment Detail is the canonical shipment detail surface.

Kootaj/customs fields remain shared shipment operation data backed by `shipment_kootaj_details`, the Daily Status projection, and Shipment Detail projections. Future work must extend those shared paths instead of recreating a separate board page or duplicate spreadsheet table.
