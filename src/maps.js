// Deep links that open the phone's own map app at a place.
// iOS opens Apple Maps; Android opens whatever app handles geo: links (usually Google Maps).

export function mapsUrl(place, os = 'ios') {
  const name = encodeURIComponent(place.name || '');
  const hasPoint = place.lat != null && place.lon != null;
  if (os === 'android') {
    if (hasPoint) return 'geo:' + place.lat + ',' + place.lon + '?q=' + place.lat + ',' + place.lon + '(' + name + ')';
    return 'geo:0,0?q=' + encodeURIComponent((place.name || '') + ' ' + (place.address || ''));
  }
  if (hasPoint) return 'https://maps.apple.com/?q=' + name + '&ll=' + place.lat + ',' + place.lon;
  return 'https://maps.apple.com/?q=' + encodeURIComponent((place.name || '') + ' ' + (place.address || ''));
}

// "123 Main St, Springfield" from OpenStreetMap address tags, or '' when there are none.
export function osmAddress(tags = {}) {
  const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
  return [street, tags['addr:city']].filter(Boolean).join(', ');
}
