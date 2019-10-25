const googleAuthLib = require("google-auth-library"),
  googleOAuthConfig = require("../helpers/authentication/configuration").google,
  { enqueueRead } = require("../helpers/limiter"),
  { google } = require("googleapis");

// result argument is what db returned on query
module.exports = (validUser, result, query, rowLimit = Infinity) => {
  const sheets = google.sheets("v4"),
    oauth2Client = new googleAuthLib.OAuth2Client(
      googleOAuthConfig.clientID,
      googleOAuthConfig.clientSecret,
      googleOAuthConfig.callbackURL
    );

  oauth2Client.credentials = {
    access_token: validUser.accessToken,
    refresh_token: validUser.refreshToken
  };

  return new Promise((resolve, reject) => {
    // Get data from spreadsheet
    enqueueRead(() => {
      return sheets.spreadsheets.values.get({
        auth: oauth2Client,
        spreadsheetId: result.googleId,
        range: query.sheet
      });
    })
      .then(response => {
        if (response.data.values.length > rowLimit) {
          reject({
            code: 429,
            message:
              "As per your subscription, you have exceeded the number of rows allowed in your sheet. Upgrade your plan to resume services."
          });
        }

        // Now parse the data into array of objects
        const parsed = [],
          values = response.data.values;

        const keys = values[0],
          offset = parseInt(query.offset) || 0,
          limit = parseInt(query.limit) || values.length - 1;

        for (
          let i = 1 + offset;
          i < values.length && i <= offset + limit;
          i++
        ) {
          const tempRow = {},
            tempValues = values[i];

          // Assign all values to keys (columns) of the row
          for (let keyIndex = 0; keyIndex < keys.length; keyIndex++) {
            tempRow[keys[keyIndex]] = tempValues[keyIndex];
          }

          // If not empty, add to array of parsed rows
          if (Object.entries(tempRow).length > 0) {
            parsed.push(tempRow);
          }
        }

        resolve(parsed);
      })
      .catch(err => reject(err));
  });
};
