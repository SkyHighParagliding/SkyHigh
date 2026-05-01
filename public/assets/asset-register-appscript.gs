/**
 * SkyHigh Paragliding Club — Asset Register Search API
 * 
 * This Apps Script exposes the Asset Register Google Sheet 
 * as a searchable JSON API that the SkyHigh website can query.
 * 
 * It reads ALL tabs in the spreadsheet (Asset Register, 
 * Loan Register, Condition Ratings, Inspection Frequencies)
 * and returns matching rows from any tab.
 *
 * INSTALL INSTRUCTIONS:
 * 1. Open your Asset Register Google Sheet
 * 2. Go to Extensions > Apps Script
 * 3. Delete any code in the editor
 * 4. Paste this entire script
 * 5. Click the disk icon to Save (or Ctrl+S)
 * 6. Click Deploy > New deployment
 * 7. Select type: Web app
 * 8. Set "Execute as" to: Me
 * 9. Set "Who has access" to: Anyone
 * 10. Click Deploy
 * 11. Copy the Web app URL
 * 12. Paste it into the SkyHigh website Connections page
 *     under the Asset Register section (Apps Script URL field)
 *
 * AFTER DEPLOYING:
 * The website can now search your Google Sheet in real time.
 * Any changes you make to the sheet are immediately searchable.
 *
 * UPDATING THE SCRIPT:
 * If you update this script, you must create a NEW deployment 
 * (Deploy > New deployment) for changes to take effect.
 * The old URL will stop working — update it on the website.
 */

function doGet(e) {
  try {
    var query = (e && e.parameter && e.parameter.q) ? e.parameter.q.toLowerCase() : "";
    var sheetName = (e && e.parameter && e.parameter.sheet) ? e.parameter.sheet : null;
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var results = [];
    
    var sheets = sheetName ? [ss.getSheetByName(sheetName)] : ss.getSheets();
    
    for (var s = 0; s < sheets.length; s++) {
      var sheet = sheets[s];
      if (!sheet) continue;
      
      var tabName = sheet.getName();
      var data = sheet.getDataRange().getValues();
      if (data.length < 2) continue;
      
      var headers = data[0].map(function(h) { return String(h).trim(); });
      
      for (var i = 1; i < data.length; i++) {
        var row = data[i];
        
        var hasContent = false;
        for (var k = 0; k < row.length; k++) {
          if (String(row[k]).trim() !== "") { hasContent = true; break; }
        }
        if (!hasContent) continue;
        
        var rowText = row.map(function(cell) { return String(cell); }).join(" ").toLowerCase();
        
        if (!query || rowText.indexOf(query) > -1) {
          var obj = { _sheet: tabName, _row: i + 1 };
          for (var j = 0; j < headers.length; j++) {
            if (headers[j]) {
              var val = row[j];
              if (val instanceof Date) {
                obj[headers[j]] = Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
              } else {
                obj[headers[j]] = String(val);
              }
            }
          }
          results.push(obj);
        }
      }
    }
    
    var output = JSON.stringify({
      success: true,
      query: query,
      count: results.length,
      results: results
    });
    
    return ContentService
      .createTextOutput(output)
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  return doGet(e);
}
