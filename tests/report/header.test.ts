import { describe, expect, it } from 'vitest';
import { readHeader } from '../../src/report/header.ts';
import { line } from './lines.ts';

describe('readHeader', () => {
  it('reads the current format: page header, profile title and the pet information block', () => {
    const header = readHeader([
      line(1, 799, [34, 'Sample Profile Name']),
      line(1, 771, [34, 'Breed: Spanish Water Dog'], [210, 'Registration number: XX00000/00']),
      line(1, 759, [34, 'Microchip number: 000000000000000'], [210, 'Test date: 2000-01-02']),
      line(1, 747, [34, 'Birth date: 2000-01-01'], [210, 'ID kit: KIT000A']),
      line(1, 694, [34, 'Sample Profile Name’s Profile']),
      line(1, 622, [34, 'Registered name'], [209, 'Sex']),
      line(1, 610, [34, 'Sample Registered Name'], [209, 'F']),
      line(1, 586, [34, 'Owner reported breed'], [209, 'Date of birth']),
      line(1, 574, [34, 'Spanish Water Dog'], [209, '2000-01-01']),
      line(1, 550, [34, 'Microchip number']),
      line(1, 538, [34, '000000000000000']),
    ]);
    expect(header).toEqual({
      profileName: 'Sample Profile Name',
      registeredName: 'Sample Registered Name',
      callName: null,
      sex: 'F',
      breed: 'Spanish Water Dog',
      kitId: 'KIT000A',
      microchip: '000000000000000',
      registration: 'XX00000/00',
      birthDate: '2000-01-01',
      testDate: '2000-01-02',
      tattoo: null,
      ownerFirstName: null,
      ownerLastName: null,
      countryOfOrigin: null,
    });
  });

  it('reads the older format: owner and pet blocks with values below their labels', () => {
    const header = readHeader([
      line(1, 744, [36, 'SAMPLE REGISTERED'], [494, 'Sample ID: KIT000D']),
      line(1, 730, [36, 'Registration: XX00000/00'], [500, 'Test Date: 1/2/2000']),
      line(1, 716, [36, 'Breed: Spanish Water Dog'], [531, 'MyDogDNA']),
      line(1, 712, [222, 'DNA Test Report']),
      line(1, 702, [36, 'Microchip Number: 000000000000000']),
      line(1, 625, [36, 'First Name'], [306, 'Last Name']),
      line(1, 611, [36, 'Owner'], [306, 'Surname']),
      line(1, 554, [36, 'Registered Name'], [306, 'Date of Birth']),
      line(1, 540, [36, 'SAMPLE REGISTERED'], [306, '1/1/2000']),
      line(1, 518, [36, 'Nickname (Call Name)'], [306, 'Sample ID']),
      line(1, 504, [36, 'Sample D'], [306, 'KIT000D']),
      line(1, 482, [36, 'Sex'], [306, 'Registration']),
      line(1, 468, [36, 'Female'], [306, 'XX00000/00']),
      line(1, 446, [36, 'Country of Origin'], [306, 'Microchip ID']),
      line(1, 432, [36, 'XX'], [306, '000000000000000']),
      line(1, 410, [36, 'Owner Reported Breed'], [306, 'Tattoo ID']),
      line(1, 396, [36, 'Spanish Water Dog'], [306, 'T-0000']),
    ]);
    expect(header).toEqual({
      profileName: null,
      registeredName: 'SAMPLE REGISTERED',
      callName: 'Sample D',
      sex: 'Female',
      breed: 'Spanish Water Dog',
      kitId: 'KIT000D',
      microchip: '000000000000000',
      registration: 'XX00000/00',
      birthDate: '1/1/2000',
      testDate: '1/2/2000',
      tattoo: 'T-0000',
      ownerFirstName: 'Owner',
      ownerLastName: 'Surname',
      countryOfOrigin: 'XX',
    });
  });

  it('pairs each value with the label above it, leaving a label without a value empty', () => {
    const header = readHeader([
      line(1, 518, [36, 'Nickname (Call Name)'], [306, 'Sample ID']),
      line(1, 504, [306, 'KIT000D']),
    ]);
    expect(header.callName).toBeNull();
    expect(header.kitId).toBe('KIT000D');
  });

  it('does not read a label line as the values of the labels above it', () => {
    const header = readHeader([
      line(1, 554, [36, 'Registered Name'], [306, 'Date of Birth']),
      line(1, 518, [36, 'Nickname (Call Name)'], [306, 'Sample ID']),
      line(1, 504, [36, 'Sample D'], [306, 'KIT000D']),
    ]);
    expect(header.registeredName).toBeNull();
    expect(header.birthDate).toBeNull();
    expect(header.callName).toBe('Sample D');
  });

  it('reads the first page only', () => {
    const header = readHeader([line(2, 622, [34, 'Sex']), line(2, 610, [34, 'M'])]);
    expect(header.sex).toBeNull();
  });
});
