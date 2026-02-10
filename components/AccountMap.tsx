'use client';

import { useState } from 'react';
import { GoogleMap, Marker, InfoWindow, Circle } from '@react-google-maps/api';
import { useRouter } from 'next/navigation';
import { ExternalLink } from 'lucide-react';

interface AccountMapProps {
  accounts: Array<{
    id: string;
    name: string;
    arr: number | null;
    ofi_score: number;
    distance_miles: number;
    priority_score: number;
    latitude: number;
    longitude: number;
    property_address_city: string | null;
    property_address_state: string | null;
    products: string | null;
  }>;
  center: { lat: number; lng: number };
  radiusMiles: number;
}

const mapContainerStyle = {
  width: '100%',
  height: '600px',
};

const mapOptions = {
  disableDefaultUI: false,
  zoomControl: true,
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: true,
};

export default function AccountMap({ accounts, center, radiusMiles }: AccountMapProps) {
  const [selectedAccount, setSelectedAccount] = useState<any>(null);
  const router = useRouter();

  // Get pin color based on friction score
  const getPinColor = (ofiScore: number | null): string => {
    if (ofiScore === null || ofiScore === 0) return '#9CA3AF'; // Gray - no data
    if (ofiScore >= 70) return '#EF4444'; // Red - high friction
    if (ofiScore >= 40) return '#F59E0B'; // Yellow - medium friction
    return '#10B981'; // Green - low friction
  };

  return (
    <div className="rounded-lg overflow-hidden border border-gray-200 shadow-sm">
      <GoogleMap
          mapContainerStyle={mapContainerStyle}
          center={center}
          zoom={8}
          options={mapOptions}
        >
          {/* Radius circle */}
          <Circle
            center={center}
            radius={radiusMiles * 1609.34} // Convert miles to meters
            options={{
              strokeColor: '#3B82F6',
              strokeOpacity: 0.8,
              strokeWeight: 2,
              fillColor: '#3B82F6',
              fillOpacity: 0.1,
            }}
          />

          {/* Center marker */}
          <Marker
            position={center}
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              scale: 10,
              fillColor: '#3B82F6',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 3,
            }}
            title="Search Center"
          />

          {/* Account markers */}
          {accounts.map((account) => (
            <Marker
              key={account.id}
              position={{
                lat: account.latitude,
                lng: account.longitude,
              }}
              icon={{
                path: google.maps.SymbolPath.CIRCLE,
                scale: 10,
                fillColor: getPinColor(account.ofi_score),
                fillOpacity: 0.9,
                strokeColor: '#ffffff',
                strokeWeight: 2,
              }}
              onClick={() => setSelectedAccount(account)}
              title={account.name}
            />
          ))}

          {/* Info window */}
          {selectedAccount && (
            <InfoWindow
              position={{
                lat: selectedAccount.latitude,
                lng: selectedAccount.longitude,
              }}
              onCloseClick={() => setSelectedAccount(null)}
            >
              <div className="p-2 min-w-[250px]">
                <h3 className="font-bold text-gray-900 mb-2 pr-4">{selectedAccount.name}</h3>

                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Location:</span>
                    <span className="font-medium">
                      {selectedAccount.property_address_city}, {selectedAccount.property_address_state}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-gray-600">Distance:</span>
                    <span className="font-medium">{selectedAccount.distance_miles} mi</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-gray-600">ARR:</span>
                    <span className="font-medium">
                      ${((selectedAccount.arr || 0) / 1000).toFixed(0)}K
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-gray-600">Friction Score:</span>
                    <span
                      className={`font-medium ${
                        selectedAccount.ofi_score >= 70
                          ? 'text-red-600'
                          : selectedAccount.ofi_score >= 40
                          ? 'text-yellow-600'
                          : 'text-green-600'
                      }`}
                    >
                      {selectedAccount.ofi_score}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-gray-600">Priority Score:</span>
                    <span className="font-bold text-blue-600">{selectedAccount.priority_score}</span>
                  </div>

                  {selectedAccount.products && (
                    <div className="pt-2 border-t border-gray-200 mt-2">
                      <p className="text-xs text-gray-600">{selectedAccount.products}</p>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => router.push(`/account/${selectedAccount.id}`)}
                  className="mt-3 w-full px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 flex items-center justify-center gap-2"
                >
                  View Account Details
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            </InfoWindow>
          )}
        </GoogleMap>

      {/* Legend */}
      <div className="bg-white border-t border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <span className="text-sm text-gray-600">High Friction (70+)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <span className="text-sm text-gray-600">Medium (40-69)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="text-sm text-gray-600">Low (0-39)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-gray-400"></div>
              <span className="text-sm text-gray-600">No Data</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-600"></div>
            <span className="text-sm text-gray-600">Search Center</span>
          </div>
        </div>
      </div>
    </div>
  );
}
